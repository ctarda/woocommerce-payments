/* global jQuery */

/**
 * Internal dependencies
 */
import './style.scss';
import { PAYMENT_METHOD_NAME, PAYMENT_METHOD_NAME_SEPA } from '../constants.js';
import { getConfig } from 'utils/checkout';
import WCPayAPI from './../api';
import enqueueFraudScripts from 'fraud-scripts';

jQuery( function ( $ ) {
	enqueueFraudScripts( getConfig( 'fraudServices' ) );

	const publishableKey = getConfig( 'publishableKey' );

	if ( ! publishableKey ) {
		// If no configuration is present, probably this is not the checkout page.
		return;
	}

	// Create an API object, which will be used throughout the checkout.
	const api = new WCPayAPI(
		{
			publishableKey,
			accountId: getConfig( 'accountId' ),
			forceNetworkSavedCards: getConfig( 'forceNetworkSavedCards' ),
		},
		// A promise-based interface to jQuery.post.
		( url, args ) => {
			return new Promise( ( resolve, reject ) => {
				jQuery.post( url, args ).then( resolve ).fail( reject );
			} );
		}
	);
	const elements = api.getStripe().elements();

	// In the future this object will be loaded with customer information through `wp_localize_script`.
	const preparedCustomerData = {};

	// Create a card element.
	const cardElement = elements.create( 'card', {
		hidePostalCode: true,
		classes: { base: 'wcpay-card-mounted' },
	} );

	const cardPayment = {
		type: 'card',
		card: cardElement,
	};

	// Create a SEPA element
	const sepaElement = elements.create( 'iban', {
		supportedCountries: [ 'SEPA' ],
		classes: { base: 'wcpay-sepa-card-mounted' },
	} );

	const sepaPayment = {
		type: 'sepa_debit' /* eslint-disable camelcase */,
		sepa_debit: sepaElement,
	};

	/**
	 * Check if SEPA Direct Debit is being used.
	 *
	 * @return {boolean} Boolean indicating whether or not SEPA Direct Debit is being used.
	 */
	const isWCPaySepaChosen = function () {
		return $( '#payment_method_woocommerce_payments_sepa' ).is(
			':checked'
		);
	};

	/**
	 * Check if Card payment is being used.
	 *
	 * @return {boolean} Boolean indicating whether or not Card payment is being used.
	 */
	const isWCPayCardChosen = function () {
		return $( '#payment_method_woocommerce_payments' ).is( ':checked' );
	};

	// Only attempt to mount the card element once that section of the page has loaded. We can use the updated_checkout
	// event for this. This part of the page can also reload based on changes to checkout details, so we call unmount
	// first to ensure the card element is re-mounted correctly.
	$( document.body ).on( 'updated_checkout', () => {
		// If the card element selector doesn't exist, then do nothing (for example, when a 100% discount coupon is applied).
		// We also don't re-mount if already mounted in DOM.
		if (
			! $( '#wcpay-card-element' ).length ||
			$( '#wcpay-card-element' ).children().length
		) {
			return;
		}

		cardElement.unmount();
		cardElement.mount( '#wcpay-card-element' );

		if ( $( '#wcpay-sepa-card-element' ).length ) {
			sepaElement.mount( '#wcpay-sepa-card-element' );
		}
	} );

	if (
		$( 'form#add_payment_method' ).length ||
		$( 'form#order_review' ).length
	) {
		cardElement.mount( '#wcpay-card-element' );

		if ( $( '#wcpay-sepa-card-element' ).length ) {
			sepaElement.mount( '#wcpay-sepa-card-element' );
		}
	}

	// Update the validation state based on the element's state.
	cardElement.addEventListener( 'change', ( event ) => {
		const displayError = $( '#wcpay-errors' );
		if ( event.error ) {
			displayError
				.html( '<ul class="woocommerce-error"><li /></ul>' )
				.find( 'li' )
				.text( event.error.message );
		} else {
			displayError.empty();
		}
	} );

	sepaElement.addEventListener( 'change', ( event ) => {
		const displayError = $( '#wcpay-sepa-errors' );
		if ( event.error ) {
			displayError
				.html( '<ul class="woocommerce-error"><li /></ul>' )
				.find( 'li' )
				.text( event.error.message );
		} else {
			displayError.empty();
		}
	} );

	/**
	 * Block UI to indicate processing and avoid duplicate submission.
	 *
	 * @param {Object} $form The jQuery object for the form.
	 */
	const blockUI = ( $form ) => {
		$form.addClass( 'processing' ).block( {
			message: null,
			overlayCSS: {
				background: '#fff',
				opacity: 0.6,
			},
		} );
	};

	// Show error notice at top of checkout form.
	const showError = ( errorMessage ) => {
		const messageWrapper =
			'<ul class="woocommerce-error" role="alert">' +
			errorMessage +
			'</ul>';
		const $container = $(
			'.woocommerce-notices-wrapper, form.checkout'
		).first();

		if ( ! $container.length ) {
			return;
		}

		// Adapted from WooCommerce core @ ea9aa8c, assets/js/frontend/checkout.js#L514-L529
		$(
			'.woocommerce-NoticeGroup-checkout, .woocommerce-error, .woocommerce-message'
		).remove();
		$container.prepend(
			'<div class="woocommerce-NoticeGroup woocommerce-NoticeGroup-checkout">' +
				messageWrapper +
				'</div>'
		);
		$container
			.find( '.input-text, select, input:checkbox' )
			.trigger( 'validate' )
			.blur();

		let scrollElement = $( '.woocommerce-NoticeGroup-checkout' );
		if ( ! scrollElement.length ) {
			scrollElement = $container;
		}

		$.scroll_to_notices( scrollElement );
		$( document.body ).trigger( 'checkout_error' );
	};

	// Create payment method on submission.
	let paymentMethodGenerated;

	/**
	 * Creates and authorizes a setup intent, saves its ID in a hidden input, and re-submits the form.
	 *
	 * @param {Object} $form         The jQuery object for the form.
	 * @param {Object} paymentMethod Payment method object.
	 */
	const handleAddCard = ( $form, paymentMethod ) => {
		api.setupIntent( paymentMethod.id )
			.then( function ( confirmedSetupIntent ) {
				// Populate form with the setup intent and re-submit.
				$form.append(
					$( '<input type="hidden" />' )
						.attr( 'id', 'wcpay-setup-intent' )
						.attr( 'name', 'wcpay-setup-intent' )
						.val( confirmedSetupIntent.id )
				);

				// WC core calls block() when add_payment_form is submitted, so we need to enable the ignore flag here to avoid
				// the overlay blink when the form is blocked twice. We can restore its default value once the form is submitted.
				const defaultIgnoreIfBlocked =
					$.blockUI.defaults.ignoreIfBlocked;
				$.blockUI.defaults.ignoreIfBlocked = true;

				// Re-submit the form.
				$form.removeClass( 'processing' ).submit();

				// Restore default value for ignoreIfBlocked.
				$.blockUI.defaults.ignoreIfBlocked = defaultIgnoreIfBlocked;
			} )
			.catch( function ( error ) {
				paymentMethodGenerated = null;
				$form.removeClass( 'processing' ).unblock();
				showError( error.message );
			} );
	};

	/**
	 * Saves the payment method ID in a hidden input, and re-submits the form.
	 *
	 * @param {Object} $form         The jQuery object for the form.
	 * @param {Object} paymentMethod Payment method object.
	 */
	const handleOrderPayment = ( $form, { id } ) => {
		const paymentSelector = isWCPaySepaChosen()
			? '#wcpay-payment-method-sepa'
			: '#wcpay-payment-method';

		// Populate form with the payment method.
		$( paymentSelector ).val( id );

		// Re-submit the form.
		$form.removeClass( 'processing' ).submit();
	};

	/**
	 * Generates a payment method, saves its ID in a hidden input, and re-submits the form.
	 *
	 * @param {Object} $form The jQuery object for the form.
	 * @param {Function} successHandler    Callback to be executed when payment method is generated.
	 * @param {boolean}  useBillingDetails Flag to control whether to use from billing details or not.
	 * @param {Object}  paymentMethodDetails { type: 'card' | 'sepa_debit', card? | sepa_debit? : Stripe element  }.
	 * @return {boolean} A flag for the event handler.
	 */
	const handlePaymentMethodCreation = (
		$form,
		successHandler,
		useBillingDetails,
		paymentMethodDetails
	) => {
		// We'll resubmit the form after populating our payment method, so if this is the second time this event
		// is firing we should let the form submission happen.
		if ( paymentMethodGenerated ) {
			paymentMethodGenerated = null;
			return;
		}

		blockUI( $form );
		const request = api.generatePaymentMethodRequest(
			paymentMethodDetails,
			preparedCustomerData
		);

		// Populate the necessary billing details.
		if ( useBillingDetails ) {
			request.setBillingDetail(
				'name',
				(
					$( '#billing_first_name' ).val() +
					' ' +
					$( '#billing_last_name' ).val()
				).trim()
			);
			request.setBillingDetail( 'email', $( '#billing_email' ).val() );
			request.setBillingDetail( 'phone', $( '#billing_phone' ).val() );
			request.setAddressDetail( 'city', $( '#billing_city' ).val() );
			request.setAddressDetail(
				'country',
				$( '#billing_country' ).val()
			);
			request.setAddressDetail(
				'line1',
				$( '#billing_address_1' ).val()
			);
			request.setAddressDetail(
				'line2',
				$( '#billing_address_2' ).val()
			);
			request.setAddressDetail(
				'postal_code',
				$( '#billing_postcode' ).val()
			);
			request.setAddressDetail( 'state', $( '#billing_state' ).val() );
		}

		request
			.send()
			.then( ( { paymentMethod } ) => {
				// Flag that the payment method has been successfully generated so that we can allow the form
				// submission next time.
				paymentMethodGenerated = true;

				successHandler( $form, paymentMethod );
			} )
			.catch( ( error ) => {
				$form.removeClass( 'processing' ).unblock();
				showError( error.message );
			} );

		// Prevent form submission so that we can fire it once a payment method has been generated.
		return false;
	};

	/**
	 * Displays the authentication modal to the user if needed.
	 */
	const maybeShowAuthenticationModal = () => {
		const paymentMethodId = isWCPaySepaChosen()
			? $( '#wcpay-payment-method-sepa' ).val()
			: $( '#wcpay-payment-method' ).val();

		const savePaymentMethod = $(
			'#wc-woocommerce_payments-new-payment-method'
		).is( ':checked' );
		const confirmation = api.confirmIntent(
			window.location.href,
			savePaymentMethod ? paymentMethodId : null
		);

		// Boolean `true` means that there is nothing to confirm.
		if ( true === confirmation ) {
			return;
		}

		const { request, isOrderPage } = confirmation;

		if ( isOrderPage ) {
			blockUI( $( '#order_review' ) );
			$( '#payment' ).hide( 500 );
		}

		// Cleanup the URL.
		// https://stackoverflow.com/a/5298684
		history.replaceState(
			'',
			document.title,
			window.location.pathname + window.location.search
		);

		request
			.then( ( redirectUrl ) => {
				window.location = redirectUrl;
			} )
			.catch( ( error ) => {
				$( 'form.checkout' ).removeClass( 'processing' ).unblock();
				$( '#order_review' ).removeClass( 'processing' ).unblock();
				$( '#payment' ).show( 500 );

				let errorMessage = error.message;

				// If this is a generic error, we probably don't want to display the error message to the user,
				// so display a generic message instead.
				if ( error instanceof Error ) {
					errorMessage = getConfig( 'genericErrorMessage' );
				}

				showError( errorMessage );
			} );
	};

	/**
	 * Checks if the customer is using a saved payment method.
	 *
	 * @return {boolean} Boolean indicating whether or not a saved payment method is being used.
	 */
	function isUsingSavedPaymentMethod() {
		if ( isWCPaySepaChosen() ) {
			return (
				$( '#wc-woocommerce_payments-payment-sepa-token-new' ).length &&
				! $( '#wc-woocommerce_payments-payment-sepa-token-new' ).is(
					':checked'
				)
			);
		}
		return (
			$( '#wc-woocommerce_payments-payment-token-new' ).length &&
			! $( '#wc-woocommerce_payments-payment-token-new' ).is( ':checked' )
		);
	}

	// Handle the checkout form when WooCommerce Payments is chosen.
	$( 'form.checkout' ).on(
		'checkout_place_order_' +
			PAYMENT_METHOD_NAME +
			' checkout_place_order_' +
			PAYMENT_METHOD_NAME_SEPA,
		function () {
			if ( ! isUsingSavedPaymentMethod() ) {
				return handlePaymentMethodCreation(
					$( this ),
					handleOrderPayment,
					true,
					isWCPaySepaChosen() ? sepaPayment : cardPayment
				);
			}
		}
	);

	// Handle the Pay for Order form if WooCommerce Payments is chosen.
	$( '#order_review' ).on( 'submit', () => {
		if (
			isUsingSavedPaymentMethod() ||
			( ! isWCPayCardChosen() && ! isWCPaySepaChosen() )
		) {
			return;
		}

		return handlePaymentMethodCreation(
			$( '#order_review' ),
			handleOrderPayment,
			true,
			isWCPaySepaChosen() ? sepaPayment : cardPayment
		);
	} );

	// Handle the add payment method form for WooCommerce Payments.
	$( 'form#add_payment_method' ).on( 'submit', function () {
		if ( ! $( '#wcpay-setup-intent' ).val() ) {
			return handlePaymentMethodCreation(
				$( 'form#add_payment_method' ),
				handleAddCard,
				false,
				isWCPaySepaChosen() ? sepaPayment : cardPayment
			);
		}
	} );

	// On every page load, check to see whether we should display the authentication
	// modal and display it if it should be displayed.
	maybeShowAuthenticationModal();

	// Handle hash change - used when authenticating payment with SCA on checkout page.
	window.addEventListener( 'hashchange', () => {
		if ( window.location.hash.startsWith( '#wcpay-confirm-' ) ) {
			maybeShowAuthenticationModal();
		}
	} );
} );
