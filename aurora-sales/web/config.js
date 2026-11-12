/* Aurora Sales: connection settings.
 * This is a separate system from the Team Tracker, so use its OWN Supabase project.
 * Leave these empty to run in demo mode (sample leads and a simulated Claude, nothing is sent).
 * Fill them in with the Aurora Sales project's "Project URL" and "anon public" key
 * (Supabase dashboard -> Project Settings -> API). The anon key is meant to be public;
 * the database's security rules protect your data. Never put the service_role key here. */
window.AURORA_SALES_CONFIG = {
  supabaseUrl: 'https://zaotlqananviygpbqdly.supabase.co',
  supabaseKey: 'sb_publishable_dI1ilI3IpEf6ELxg4wXPKQ_1xxhCpIh',
};
