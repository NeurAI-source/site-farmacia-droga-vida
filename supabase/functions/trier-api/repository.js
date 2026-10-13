export function repository(db, storeId) {
  const checked = result => { if (result.error) throw Error('database_operation_failed'); return result.data; };
  return {
    claim: async minutes => checked(await db.rpc('trier_claim_sync', {minutes, integrated_store:storeId})),
    apply: async (payload, lease) => checked(await db.rpc('trier_apply_inventory', {payload, run_id:lease})),
    finish: async (summary, lease) => checked(await db.rpc('trier_finish_sync', {result_summary:summary, run_id:lease})),
  };
}
