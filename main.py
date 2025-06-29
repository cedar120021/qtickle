# main.py

import os
from flask import Flask, request, jsonify
import stripe
from flask_cors import CORS # Import CORS
import os
from flask import Flask, request, jsonify, redirect, url_for, session, send_from_directory
from flask_cors import CORS  # Import CORS library
import requests
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from upstash_redis import Redis
import time

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

# Define your frontend URLs for success and cancel redirects
# Make sure these match where your index.html file is served from (e.g., http://localhost:8000)
BASE_URL = "http://127.0.0.1:5000"
SUCCESS_URL = f"{BASE_URL}/index.html?payment=success"
CANCEL_URL = f"{BASE_URL}/index.html?payment=cancelled"

@app.route('/')
@app.route('/index.html')
def serve_index():
    # 'directory' is the path where the file is located relative to the app's root
    # 'index.html' is the filename
    return send_from_directory(os.getcwd(), 'index.html') # os.getcwd() refers to the current working directory (root)


@app.route('/create-checkout-session', methods=['POST'])
def create_checkout_session():
    try:
        data = request.get_json()
        cart_items = data.get('lineItems')

        if not cart_items:
            return jsonify({'error': 'No items in cart.'}), 400

        # Validate and transform cart items into Stripe's line_items format
        # IMPORTANT: In a real application, you should re-validate product prices and availability
        # on the server-side to prevent tampering.
        line_items_for_stripe = []
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

        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=line_items_for_stripe,
            mode='payment',
            # Stripe will redirect to this backend endpoint after success

            success_url=f'{BASE_URL}/stripe-success-handler?session_id={{CHECKOUT_SESSION_ID}}',
            # IMPORTANT CHANGE HERE
            cancel_url=CANCEL_URL,  # Still redirects to frontend cancel directly
        )
        return jsonify({'id': checkout_session.id})

    except stripe.error.StripeError as e:
        # Handle Stripe API errors
        print(f"Stripe Error: {e}")
        return jsonify({'error': str(e)}), 400
    except ValueError as e:
        # Handle custom validation errors (e.g., invalid price)
        print(f"Validation Error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        # Handle any other unexpected errors
        print(f"Server Error: {e}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500


@app.route('/stripe-success-handler')
def stripe_success_handler():
    session_id = request.args.get('session_id')
    if not session_id:
        print("Error: No session_id found in success handler redirect.")
        return redirect(CANCEL_URL) # Redirect to cancel if session_id is missing

    try:
        # Retrieve the session from Stripe
        checkout_session = stripe.checkout.Session.retrieve(session_id)

        # Log or record transaction details here
        print(f"Stripe Checkout Session retrieved: {checkout_session.id}")
        print(f"Payment Status: {checkout_session.payment_status}")
        print(f"Customer Email: {checkout_session.customer_details.email if checkout_session.customer_details else 'N/A'}")
        # Add your database updates, order fulfillment logic, email sending, etc. here

        if checkout_session.payment_status == 'paid':
            # Payment was successful, perform your backend fulfillment logic
            print(f"Payment for session {session_id} was successful!")
            # Example: Save order to database, send confirmation email, etc.
            # After processing, redirect to the frontend success page
            return redirect(SUCCESS_URL)
        else:
            # Payment not successful (e.g., pending, failed)
            print(f"Payment for session {session_id} was NOT successful. Status: {checkout_session.payment_status}")
            return redirect(CANCEL_URL)

    except stripe.error.StripeError as e:
        print(f"Stripe Error retrieving session: {e}")
        return redirect(CANCEL_URL) # Redirect to cancel on Stripe API error
    except Exception as e:
        print(f"Server Error in success handler: {e}")
        return redirect(CANCEL_URL) # Redirect to cancel on generic error




# You would also set up a webhook endpoint here for production
# to fulfill orders after successful payment.
# This is crucial for securely confirming payments and is beyond a pure client-side demo.
@app.route('/webhook', methods=['POST'])
def stripe_webhook():
   payload = request.get_data()
   sig_header = request.headers.get('stripe-signature')
   event = None

   try:
       event = stripe.Webhook.construct_event(
           payload, sig_header, os.getenv('STRIPE_WEBHOOK_SECRET') # Replace with your webhook secret
       )
   except ValueError as e:
       # Invalid payload
       return str(e), 400
   except stripe.error.SignatureVerificationError as e:
       # Invalid signature
       return str(e), 400

   # Handle the event
   if event['type'] == 'checkout.session.completed':
       session = event['data']['object']
       print("Payment successful:", session)
       # Fulfill the purchase, update database, send email, etc.
   # ... handle other event types

   return jsonify(success=True)





app.secret_key = os.getenv("mafteah_sod")


CORS(app, resources={r"/api/*": {"origins": "https://www.qtickle.com"}})
#CORS(app, resources={r"/validate-captcha": {"origins": "https://www.prepforinterviews.com"}})

RECAPTCHA_SECRET_KEY = "6LcXxroqAAAAAGeX9BkQ5oAxyKeeyoGPpesYUQkL"
GMAIL_USER = os.getenv("doar_ktovet")
GMAIL_PASSWORD = os.getenv("doar_sisma")

REDIS_TOKEN = os.getenv("redis_token")
REDIS_URL = os.getenv("redis_url")
REDIS_PORT = os.getenv("redis_port")
#REDIS_PY_URL=os.getenv("redis_py_url") #redis://...


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
    #recaptcha_metadata = verify_recaptcha.verify_recaptcha(recaptcha_response)

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
        attempt_count = int(ip_record[0])
        split_string = ip_record.split("-")  # Split by the hyphen
        first_attempt = split_string[1]  # Access the second element (the first timestamp)
        time_stamps = ip_record[ip_record.find("-") + 1:]  # Slice everything after the first hyphen
        print("attempt count: " + str(attempt_count))
        print("first_attempt: " + first_attempt)
        time_elapsed = current_time - float(first_attempt)
        print("time_difference: " + str(time_elapsed))
        if time_elapsed > TIME_WINDOW:
            print("time elapsed, setting ip_address record to zero")
            redis_client.set(ip_address, "1-" + str(current_time))
        elif attempt_count <= MAX_SUBMISSIONS:
            redis_client.set(ip_address, str(attempt_count + 1) + "-" + time_stamps + "-" + str(current_time))
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
    app.run(port=5000, debug=True) # debug=True is for development only!