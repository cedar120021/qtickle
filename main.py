# main.py

import os
from flask import Flask, request, jsonify
import stripe
from flask_cors import CORS # Import CORS

app = Flask(__name__)
# IMPORTANT: In a production environment, configure CORS more restrictively
# to only allow your specific frontend domain(s).
# For local development, you might allow '*' or your specific localhost port.
CORS(app, resources={r"/create-checkout-session": {"origins": "*"}})


# Replace with your actual Stripe Secret Key
# It's highly recommended to load this from environment variables
# For example: stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
stripe.api_key = 'YOUR_STRIPE_SECRET_KEY' # <--- REPLACE THIS with your sk_test_... key

# Define your frontend URLs for success and cancel redirects
# Make sure these match where your index.html file is served from (e.g., http://localhost:8000)
FRONTEND_SUCCESS_URL = 'http://localhost:8000/success.html' # <--- Adjust this
FRONTEND_CANCEL_URL = 'http://localhost:8000/cancel.html'   # <--- Adjust this

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
            success_url=FRONTEND_SUCCESS_URL + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=FRONTEND_CANCEL_URL,
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

# You would also set up a webhook endpoint here for production
# to fulfill orders after successful payment.
# This is crucial for securely confirming payments and is beyond a pure client-side demo.
# @app.route('/webhook', methods=['POST'])
# def stripe_webhook():
#    payload = request.get_data()
#    sig_header = request.headers.get('stripe-signature')
#    event = None
#
#    try:
#        event = stripe.Webhook.construct_event(
#            payload, sig_header, os.getenv('STRIPE_WEBHOOK_SECRET') # Replace with your webhook secret
#        )
#    except ValueError as e:
#        # Invalid payload
#        return str(e), 400
#    except stripe.error.SignatureVerificationError as e:
#        # Invalid signature
#        return str(e), 400
#
#    # Handle the event
#    if event['type'] == 'checkout.session.completed':
#        session = event['data']['object']
#        print("Payment successful:", session)
#        # Fulfill the purchase, update database, send email, etc.
#    # ... handle other event types
#
#    return jsonify(success=True)

if __name__ == '__main__':
    # You might want to run this with Flask's built-in server for development:
    # flask run
    # Or for a simple script:
    app.run(port=5000, debug=True) # debug=True is for development only!