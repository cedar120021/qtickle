# main.py

import os
from flask import Flask, request, jsonify, redirect, url_for, session, send_from_directory
from flask_cors import CORS  # Import CORS library
import stripe
import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from upstash_redis import Redis
import time
import re  # Import regex for zip code validation

app = Flask(__name__)
# IMPORTANT: In a production environment, configure CORS more restrictively
# to only allow your specific frontend domain(s).
# For local development, you might allow '*' or your specific localhost port.
CORS(app, resources={r"/create-checkout-session": {"origins": "*"}})

# Replace with your actual Stripe Secret Key
# It's highly recommended to load this from environment variables
# For example: stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')  # <--- REPLACE THIS with your sk_test_... key

if not stripe.api_key:
    raise ValueError("STRIPE_SECRET_KEY environment variable not set.")

# Define your frontend URLs (these should match what's in your JavaScript)
# These URLs will send users back to index.html with query parameters
# for the frontend to handle the message via a modal.
# IMPORTANT: Ensure this BASE_URL exactly matches the URL where your frontend index.html is served.
# For example, if your frontend is running via `python -m http.server` on port 8000,
# and your Flask backend is on port 5000, your BASE_URL for the frontend should be
# 'http://localhost:8000' or 'http://127.0.0.1:8000' depending on how you access it in the browser.
BASE_URL = "http://localhost:5000"  # Changed to localhost for common Flask development setup
SUCCESS_URL = f"{BASE_URL}/index.html?payment=success"
CANCEL_URL = f"{BASE_URL}/index.html?payment=cancelled"


@app.route('/')
@app.route('/index.html')
def serve_index():
    # 'directory' is the path where the file is located relative to the app's root
    # 'index.html' is the filename
    return send_from_directory(os.getcwd(), 'index.html')  # os.getcwd() refers to the current working directory (root)


# New function to calculate shipping cost on the backend
def calculate_shipping_cost_backend(country_code, subtotal):
    """
    Calculates a basic estimated shipping cost based on country and subtotal.
    This should be replaced with actual carrier API calls or more complex logic.
    Returns cost in USD.
    """
    if subtotal == 0:
        return 0

    # These are illustrative flat rates. In a real app, you'd use external APIs
    # like ShipEngine, Shippo, or specific carrier APIs (UPS, FedEx, USPS).
    # You might also consider product weight/dimensions for more accurate rates.
    if country_code == 'US':
        return 5.00
    elif country_code == 'CA':
        return 10.00
    elif country_code == 'MX':
        return 12.00
    elif country_code == 'GB':
        return 15.00
    elif country_code == 'AU':
        return 18.00
    else:
        return 20.00  # Default for other international countries


def validate_zip_code_backend(zip_code, country_code):
    """
    Validates a zip code based on the country code using basic regex.
    This is a simple example and should be expanded for production.
    """
    if not zip_code:
        return False

    if country_code == 'US':
        # US Zip Code: 5 digits or 5 digits + 4 digits (e.g., 12345 or 12345-6789)
        return re.fullmatch(r'^\d{5}(?:-\d{4})?$', zip_code) is not None
    elif country_code == 'CA':
        # Canadian Postal Code: A1A 1A1 (format LNL NLN where L is letter, N is number)
        return re.fullmatch(r'^[A-Z]\d[A-Z]\s?\d[A-Z]\d$', zip_code, re.IGNORECASE) is not None
    elif country_code == 'GB':
        # UK Postcode: Highly variable, this is a simplified example (e.g., SW1A 0AA, B33 8TH)
        # Real UK postcodes are complex: https://en.wikipedia.org/wiki/Postcodes_in_the_United_Kingdom#Formatting
        return re.fullmatch(r'^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$', zip_code, re.IGNORECASE) is not None
    elif country_code == 'AU':
        # Australian Postcode: 4 digits
        return re.fullmatch(r'^\d{4}$', zip_code) is not None
    elif country_code == 'MX':
        # Mexican Postal Code: 5 digits
        return re.fullmatch(r'^\d{5}$', zip_code) is not None
    else:
        # For other countries or if validation is not strictly defined, assume valid if not empty
        return True  # Or implement more specific regexes for other countries


@app.route('/create-checkout-session', methods=['POST'])
def create_checkout_session():
    try:
        data = request.get_json()
        # Ensure the frontend sends data with the key 'lineItems' as expected by your main.py
        cart_items = data.get('lineItems', [])
        shipping_address_data = data.get('shippingAddress', {})  # Get shipping address from frontend

        if not cart_items:
            return jsonify({'error': 'No items in cart.'}), 400

        # Server-side validation for shipping address data
        shipping_zip_code = shipping_address_data.get('zip_code', '').strip()
        shipping_country = shipping_address_data.get('country')

        if not validate_zip_code_backend(shipping_zip_code, shipping_country):
            return jsonify({'error': 'Invalid shipping zip code for selected country.'}), 400

        line_items_for_stripe = []
        subtotal_cents = 0
        for item in cart_items:
            # Safely get the 'price_data' dictionary
            price_data = item.get('price_data', {})
            product_data = price_data.get('product_data', {})

            # Safely get the unit_amount (which is already in cents from frontend)
            unit_amount_cents = price_data.get('unit_amount')
            product_name = product_data.get('name')
            quantity = item.get('quantity')

            # Basic validation for debugging
            print(f"Processing item: Name={product_name}, UnitAmount={unit_amount_cents}, Quantity={quantity}")

            # Check for missing essential data
            if product_name is None:
                raise ValueError("Product name is missing for an item.")
            if unit_amount_cents is None:
                raise ValueError(f"Price (unit_amount) is missing for item: {product_name}")
            if quantity is None:
                raise ValueError(f"Quantity is missing for item: {product_name}")

            # Ensure unit_amount_cents is an integer and validate its value
            try:
                unit_amount_cents = int(unit_amount_cents)
            except (TypeError, ValueError):
                raise ValueError(
                    f"Invalid format for unit_amount for item: {product_name}. Received: {unit_amount_cents}")

            if unit_amount_cents <= 0:
                raise ValueError(
                    f"Invalid (non-positive) price for item: {product_name}. Received: {unit_amount_cents} cents")

            line_items_for_stripe.append({
                'price_data': {
                    'currency': 'usd',  # <-- Keep your currency consistent here
                    'product_data': {
                        'name': product_name,
                        # 'images': [item['image_url']] if 'image_url' in item else [], # Optional: if you have product images
                    },
                    'unit_amount': unit_amount_cents,
                },
                'quantity': quantity,
            })
            subtotal_cents += unit_amount_cents * quantity

        # Calculate shipping cost on the backend
        # Convert subtotal_cents to dollars for the shipping calculation function
        shipping_amount_dollars = calculate_shipping_cost_backend(shipping_country, subtotal_cents / 100)
        shipping_amount_cents = int(shipping_amount_dollars * 100)  # Convert back to cents for Stripe

        # Define shipping options for Stripe
        shipping_options_for_stripe = []
        if shipping_amount_cents > 0:
            shipping_options_for_stripe.append({
                'shipping_rate_data': {
                    'type': 'fixed_amount',
                    'fixed_amount': {'amount': shipping_amount_cents, 'currency': 'usd'},
                    'display_name': 'Standard Shipping',
                    'delivery_estimate': {
                        'minimum': {'unit': 'business_day', 'value': 3},
                        'maximum': {'unit': 'business_day', 'value': 7},
                    }
                },
            })

        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=line_items_for_stripe,
            mode='payment',
            # Include shipping address collection
            shipping_address_collection={
                'allowed_countries': ['US', 'CA', 'MX', 'GB', 'AU'],  # List of countries you ship to
            },
            shipping_options=shipping_options_for_stripe,  # Add the calculated shipping options
            success_url=f'{BASE_URL}/stripe-success-handler?session_id={{CHECKOUT_SESSION_ID}}',
            cancel_url=CANCEL_URL,
        )
        return jsonify({'id': checkout_session.id})

    except stripe.error.StripeError as e:
        # Handle Stripe API errors
        print(f"Stripe Error: {e}")  # Log the error for debugging
        return jsonify({'error': str(e)}), 400
    except ValueError as e:
        # Handle custom validation errors (e.g., invalid price)
        print(f"Validation Error: {e}")  # Log the error for debugging
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        # Handle any other unexpected errors
        print(f"Server Error: {e}")  # Log the error for debugging
        return jsonify({'error': 'An unexpected error occurred.'}), 500


@app.route('/stripe-success-handler')
def stripe_success_handler():
    session_id = request.args.get('session_id')
    if not session_id:
        print("Error: No session_id found in success handler redirect.")
        # If no session_id, it's safer to redirect to cancel to avoid undefined state
        return redirect(CANCEL_URL)

    try:
        # Retrieve the session from Stripe
        checkout_session = stripe.checkout.Session.retrieve(
            session_id,
            expand=['line_items']  # Only expand line_items, if needed. shipping_details is direct.
        )

        # --- DEBUGGING: Print the full checkout_session object ---
        print("\n--- FULL STRIPE CHECKOUT SESSION OBJECT ---")
        print(checkout_session)
        print("-------------------------------------------\n")

        # Log or record transaction details here.
        # For production, you'd save this to your database.
        print(f"\n--- Stripe Checkout Session retrieved for success handler ---")
        print(f"Session ID: {checkout_session.id}")
        print(f"Payment Status: {checkout_session.payment_status}")  # Explicitly print status for debugging
        print(f"Total Amount: {checkout_session.amount_total / 100:.2f} {checkout_session.currency.upper()}")
        print(f"Customer Email: {getattr(checkout_session.customer_details, 'email', 'N/A')}")
        print(f"Customer Name: {getattr(checkout_session.customer_details, 'name', 'N/A')}")

        # Accessing shipping details with more robust checks
        # Use getattr() for safe access to object attributes that might be None
        # shipping_details should be directly accessible on the session object
        if hasattr(checkout_session, 'shipping_details') and checkout_session.shipping_details:
            print("Shipping Details:")
            print(f"  Name: {getattr(checkout_session.shipping_details, 'name', 'N/A')}")

            address = getattr(checkout_session.shipping_details, 'address', None)
            if address:
                print(f"  Line1: {getattr(address, 'line1', 'N/A')}")
                if getattr(address, 'line2', None):
                    print(f"  Line2: {getattr(address, 'line2', 'N/A')}")
                print(f"  City: {getattr(address, 'city', 'N/A')}")
                print(f"  State: {getattr(address, 'state', 'N/A')}")
                print(f"  Postal Code: {getattr(address, 'postal_code', 'N/A')}")
                print(f"  Country: {getattr(address, 'country', 'N/A')}")
            else:
                print("  Address details not available within shipping_details.")
        else:
            print("No shipping details provided in session.")

        # Shipping cost details
        if hasattr(checkout_session, 'shipping_cost') and checkout_session.shipping_cost:
            print("Shipping Cost:")
            print(
                f"  Amount: {getattr(checkout_session.shipping_cost, 'amount_total', 0) / 100:.2f} {getattr(checkout_session.shipping_cost, 'currency', 'USD').upper()}")
            shipping_rate = getattr(checkout_session.shipping_cost, 'shipping_rate', None)
            if shipping_rate:
                print(f"  Rate Display Name: {getattr(shipping_rate, 'display_name', 'N/A')}")
        else:
            print("No specific shipping cost details in session.")

        # Accessing line items from the expanded session
        if hasattr(checkout_session, 'line_items') and checkout_session.line_items and checkout_session.line_items.data:
            print("\nLine Items (from expanded session):")
            for item in checkout_session.line_items.data:
                # 'description' is usually the product name for line_items from Checkout Session
                print(
                    f"  - Product: {getattr(item, 'description', 'N/A')}, Quantity: {getattr(item, 'quantity', 'N/A')}, Price: {getattr(item, 'amount_total', 0) / 100:.2f}")
        else:
            print("No line items available in the session (consider expanding them).")

        if checkout_session.payment_status == 'paid':
            # Payment was successful, perform your backend fulfillment logic
            print(f"Payment for session {session_id} was successful! Redirecting to SUCCESS_URL.")
            # After processing, redirect to the frontend success page
            return redirect(SUCCESS_URL)
        else:
            # Payment not successful (e.g., pending, failed)
            print(
                f"Payment for session {session_id} was NOT successful. Status: {checkout_session.payment_status}. Redirecting to CANCEL_URL.")
            return redirect(CANCEL_URL)

    except stripe.error.StripeError as e:
        print(f"Stripe Error retrieving session in success handler: {e}")
        return redirect(CANCEL_URL)  # Redirect to cancel on Stripe API error
    except Exception as e:
        print(f"Server Error in success handler: {e}")
        return redirect(CANCEL_URL)  # Redirect to cancel on generic error


# --- Webhook Endpoint for Secure Order Fulfillment ---
@app.route('/webhook', methods=['POST'])
def stripe_webhook():
    payload = request.get_data()
    sig_header = request.headers.get('stripe-signature')
    event = None

    # IMPORTANT: Configure your webhook secret in your environment variables!
    # stripe listen --forward-to localhost:5000/webhook
    # Set the webhook secret in your Vercel project settings: STRIPE_WEBHOOK_SECRET
    WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')

    if not WEBHOOK_SECRET:
        print("Error: STRIPE_WEBHOOK_SECRET environment variable not set for webhook validation.")
        return jsonify({'error': 'Webhook secret not configured.'}), 500

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, WEBHOOK_SECRET
        )
    except ValueError as e:
        # Invalid payload
        print(f"Webhook Error: Invalid payload: {e}")
        return str(e), 400
    except stripe.error.SignatureVerificationError as e:
        # Invalid signature
        print(f"Webhook Error: Invalid signature: {e}")
        return str(e), 400

    # Handle the event
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']

        # --- CAPTURE TRANSACTION DETAILS HERE (Webhook is the ideal place for fulfillment) ---
        print("\n--- Webhook: checkout.session.completed received ---")
        print(f"Session ID: {session.id}")
        print(f"Payment Status: {session.payment_status}")
        print(f"Amount Total (cents): {session.amount_total}")  # Total amount including shipping
        print(f"Currency: {session.currency}")

        # Customer details
        if session.customer_details:
            print(f"Customer Email: {session.customer_details.email}")
            print(f"Customer Name: {session.customer_details.name}")
        else:
            print("Customer details not available.")

        # Shipping details
        if session.shipping_details and session.shipping_details.address:
            print("Shipping Address:")
            address = session.shipping_details.address
            print(f"  Name: {session.shipping_details.name}")
            print(f"  Line1: {address.line1}")
            if address.line2:
                print(f"  Line2: {address.line2}")
            print(f"  City: {address.city}")
            print(f"  State: {address.state}")
            print(f"  Postal Code: {address.postal_code}")
            print(f"  Country: {address.country}")
        else:
            print("Shipping details not available.")

        # Shipping cost details
        if session.shipping_cost:
            print("Shipping Cost:")
            print(f"  Amount: {session.shipping_cost.amount_total / 100} {session.shipping_cost.currency.upper()}")
            if session.shipping_cost.shipping_rate:
                print(f"  Rate Display Name: {session.shipping_cost.shipping_rate.display_name}")
        else:
            print("No specific shipping cost details in session.")

        # To get the actual line items (products purchased) and their details,
        # you often need to retrieve the session with `expand=['line_items']`
        # or list the line items separately using `stripe.checkout.Session.list_line_items`.
        # For a webhook, you might need to make an additional API call here
        # if you need granular product details not present directly in the initial session object.
        # Example (uncomment and replace if you need full line item expansion):
        # try:
        #     expanded_session = stripe.checkout.Session.retrieve(session.id, expand=['line_items'])
        #     print("\nLine Items (expanded via API call):")
        #     for item in expanded_session.line_items.data:
        #         print(f"  - Product: {item.description}, Quantity: {item.quantity}, Price: {item.amount_total / 100}")
        # except Exception as e:
        #     print(f"Could not expand line items: {e}")

        # --- FULFILL ORDER / SAVE TO DATABASE HERE ---
        # This is where you would typically:
        # 1. Save the order details (customer, address, items, total, shipping) to your database.
        # 2. Update inventory.
        # 3. Send a confirmation email to the customer.
        # 4. Trigger fulfillment processes (e.g., generate shipping labels via another API).
        print("--- Order fulfillment logic would go here ---")

    elif event['type'] == 'payment_intent.succeeded':
        # This event is also useful but checkout.session.completed is usually
        # preferred for order fulfillment directly after Checkout.
        payment_intent = event['data']['object']
        print(f"Webhook: payment_intent.succeeded received for PaymentIntent {payment_intent.id}")
    elif event['type'] == 'payment_intent.payment_failed':
        payment_intent = event['data']['object']
        print(f"Webhook: payment_intent.payment_failed received for PaymentIntent {payment_intent.id}")
        # Handle failed payments (e.g., notify customer, log for review)
    # Add handlers for other relevant events as needed (e.g., 'charge.refunded')

    return jsonify(success=True)  # Always return a 200 OK to Stripe to acknowledge receipt


app.secret_key = os.getenv("mafteah_sod")

CORS(app, resources={r"/api/*": {"origins": "https://www.qtickle.com"}})
# CORS(app, resources={r"/validate-captcha": {"origins": "https://www.prepforinterviews.com"}})

RECAPTCHA_SECRET_KEY = "6LcXxroqAAAAAGeX9BkQ5oAxyKeeyoGPpesYUQkL"
GMAIL_USER = os.getenv("doar_ktovet")
GMAIL_PASSWORD = os.getenv("doar_sisma")

REDIS_TOKEN = os.getenv("redis_token")
REDIS_URL = os.getenv("redis_url")
REDIS_PORT = os.getenv("redis_port")
# REDIS_PY_URL=os.getenv("redis_py_url") #redis://...


redis_client = Redis(
    url=REDIS_URL,
    token=REDIS_TOKEN)

# Maximum allowed submissions per IP within the time window
MAX_SUBMISSIONS = 3
TIME_WINDOW = 60 * 5  # 5 minutes in seconds


@app.route("/validate-captcha", methods=["POST"])
def validate_captcha():
    data = request.json
    name = data.get("name")
    email = data.get("email")
    message = data.get("message")
    recaptcha_response = data.get("g-recaptcha-response")
    # recaptcha_metadata = verify_recaptcha.verify_recaptcha(recaptcha_response)

    ip_address = request.remote_addr  # Get the user's IP address
    recaptcha_response = request.json.get("g-recaptcha-response")

    ip_record = redis_client.get(ip_address)
    print("ip_record: " + str(ip_record))
    current_time = time.time()

    # Track submissions per session
    if ip_record == None:
        print("ip_record doesn't exist")
        redis_client.set(ip_address, "1-" + str(current_time))
    else:
        # Decode the byte string from Redis if it's not None
        decoded_ip_record = ip_record.decode('utf-8') if isinstance(ip_record, bytes) else ip_record

        split_string = decoded_ip_record.split("-")  # Split by the hyphen
        attempt_count = int(split_string[0])  # Access the first element (the attempt count)
        first_attempt = float(split_string[1])  # Access the second element (the first timestamp)

        print("attempt count: " + str(attempt_count))
        print("first_attempt: " + str(first_attempt))
        time_elapsed = current_time - float(first_attempt)
        print("time_difference: " + str(time_elapsed))
        if time_elapsed > TIME_WINDOW:
            print("time elapsed, setting ip_address record to zero")
            redis_client.set(ip_address, "1-" + str(current_time))
        elif attempt_count < MAX_SUBMISSIONS:  # Use < instead of <= to allow up to MAX_SUBMISSIONS attempts
            # Reconstruct time_stamps from existing parts
            time_stamps_parts = split_string[1:]  # Get all timestamp parts
            new_time_stamps_str = "-".join(time_stamps_parts) + "-" + str(current_time)
            redis_client.set(ip_address, str(attempt_count + 1) + "-" + new_time_stamps_str)
            print("time didn't elapse, add another timestamp.  New record value: " + str(redis_client.get(ip_address)))
        else:
            print("Submission limit exceeded. Please try again later.")
            return jsonify({"success": False, "message": "Submission limit exceeded. Please try again later."}), 429

    # Verify reCAPTCHA response
    response = requests.post(
        "https://www.google.com/recaptcha/api/siteverify",
        data={
            "secret": RECAPTCHA_SECRET_KEY,
            "response": recaptcha_response,
        },
    )
    recaptcha_result = response.json()

    print("results: " + str(recaptcha_result))

    if recaptcha_result.get("success"):
        # Send an email with the form data
        try:
            send_email(name, email, message, recaptcha_result)
            return jsonify({"success": True, "message": "Thank you for your message!  You will be contacted shortly."})
        except Exception as e:
            print(f"Error sending email: {e}")
            return jsonify({"success": False, "message": "Submission failed."}), 500
    else:
        return jsonify({"success": False, "message": "Submission validation failed. Please try again later"}), 400


def send_email(name, email, message, recaptcha_result):
    """
    Sends an email containing the form data and reCAPTCHA response.
    """
    # Create email content
    subject = "New Form Submission with reCAPTCHA Data"
    body = f"""
    You have received a new form submission:

    Name: {name}
    Email: {email}
    Message: {message}

    reCAPTCHA Result:
    {recaptcha_result}
    """

    # Set up the email message
    msg = MIMEMultipart()
    msg["From"] = GMAIL_USER
    msg["To"] = GMAIL_USER  # Send to your own email address
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    # Send the email using Gmail's SMTP server
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()  # Secure the connection
        server.login(GMAIL_USER, GMAIL_PASSWORD)  # Login to Gmail
        server.sendmail(GMAIL_USER, GMAIL_USER, msg.as_string())  # Send email


if __name__ == '__main__':
    # You might want to run this with Flask's built-in server for development:
    # flask run
    # Or for a simple script:
    app.run(port=5000, debug=True)  # debug=True is for development only!
