export function adminPath(env = process.env) {
  const value = env.ADMIN_PANEL_PATH;
  if (!value) {
    if (env.REQUIRE_PRIVATE_ADMIN_PATH === '1') throw Error('Private administrative path is required for publication.');
    return 'admin'; // Local development and isolated browser tests only.
  }
  if (!/^acesso-[a-f0-9]{32}$/.test(value)) throw Error('Invalid private administrative path.');
  return value;
}
