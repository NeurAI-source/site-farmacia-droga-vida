export function repository(db, storeId) {
  const checked = result => { if (result.error) throw Error('database_operation_failed'); return result.data; };
  return {
    claim: async minutes => checked(await db.rpc('trier_claim_sync', {minutes, integrated_store:storeId})),
    apply: async payload => checked(await db.rpc('trier_apply_inventory', {payload})),
    finish: async summary => checked(await db.from('trier_sync_state').update({summary,finished_at:new Date().toISOString(),lease_until:null}).eq('id',1)),
  };
}
