/**
 * tableCustomerKitchenUserSync — stub
 * Restores the import required by backend/routes/kitchen.js.
 * The full customer presence-sync logic was removed with the previous
 * customer module; this no-op stub keeps the kitchen route functional.
 */

async function syncUsersForKitchenOrder(cafeId, io, orderId, status) {
  // no-op — customer socket presence sync not required in this version
}

module.exports = { syncUsersForKitchenOrder };
