/** @format */
/* eslint-disable camelcase */

/**
 * Internal dependencies
 */
import { getResourceId } from '../../util';
import {
	getDeposits,
	getDepositQueryError,
} from '../selectors';

describe( 'Deposits selectors', () => {
	// Mock objects.
	const mockQuery = { paged: '2', perPage: '50' };
	const mockDeposits = [
		{
			id: 'po_mock1',
			amount: 2000,
		},
		{
			id: 'po_mock2',
			amount: 3000,
		},
	];
	const mockError = {
		error: 'Something went wrong!',
		code: 400,
	};

	// Sections in initial state are empty.
	const emptyState = {
		deposits: {},
	};

	// State is populated.
	const filledSuccessState = {
		deposits: {
			byId: {
				po_mock1: mockDeposits[ 0 ],
				po_mock2: mockDeposits[ 1 ],
			},
			queries: {
				[ getResourceId( mockQuery ) ]: {
					data: [ 'po_mock1', 'po_mock2' ],
				},
			},
		},
	};
	const filledErrorState = {
		deposits: {
			queries: {
				[ getResourceId( mockQuery ) ]: {
					error: mockError,
				},
			},
		},
	};

	test( 'Returns empty deposits list when deposits list is empty', () => {
		expect( getDeposits( emptyState, mockQuery ) ).toStrictEqual( [] );
	} );

	test( 'Returns deposits list from state', () => {
		const expected = mockDeposits;
		expect( getDeposits( filledSuccessState, mockQuery ) ).toStrictEqual( expected );
	} );

	test( 'Returns empty deposits query error when error is empty', () => {
		expect( getDepositQueryError( emptyState, mockQuery ) ).toStrictEqual( {} );
	} );

	test( 'Returns deposits query error from state', () => {
		const expected = mockError;
		expect( getDepositQueryError( filledErrorState, mockQuery ) ).toBe( expected );
	} );
} );
