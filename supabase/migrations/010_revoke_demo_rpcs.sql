-- Revoke demo RPC access from anon and authenticated roles
-- These SECURITY DEFINER functions bypass RLS and should only be callable by service_role
REVOKE EXECUTE ON FUNCTION get_demo_customers() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_demo_customer(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION demo_add_dog(text, text, text, uuid) FROM anon, authenticated;
