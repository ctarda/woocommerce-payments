// Generated by BUCKLESCRIPT, PLEASE EDIT WITH CARE
'use strict';

var Curry = require("bs-platform/lib/js/curry.js");
var HooksGen = require("./hooks.gen");
var Constants$WoocommercePayments = require("../constants.bs.js");

function useSelect(prim, prim$1) {
  return HooksGen.useSelect(prim, prim$1);
}

function useCharge(chargeId) {
  return HooksGen.useSelect((function (select) {
                var match = Curry._1(select, Constants$WoocommercePayments.storeName);
                return {
                        charge: match.getCharge(chargeId),
                        chargeError: match.getChargeError(chargeId),
                        isLoading: match.isResolving("getCharge", [chargeId])
                      };
              }), [chargeId]);
}

exports.useSelect = useSelect;
exports.useCharge = useCharge;
/* ./hooks.gen Not a pure module */