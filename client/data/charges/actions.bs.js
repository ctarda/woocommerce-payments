// Generated by BUCKLESCRIPT, PLEASE EDIT WITH CARE
'use strict';


function updateCharge(id, data) {
  return {
          type: "SET_CHARGE",
          id: id,
          data: data,
          error: undefined
        };
}

function updateErrorForCharge(id, data, error) {
  return {
          type: "SET_ERROR_FOR_CHARGE",
          id: id,
          data: data,
          error: error
        };
}

exports.updateCharge = updateCharge;
exports.updateErrorForCharge = updateErrorForCharge;
/* No side effect */