-- Revoke demo RPC access from anon and authenticated roles
-- These SECURITY DEFINER functions bypass RLS and should only be callable by service_role

DO $$
BEGIN
  IF to_regprocedure('public.get_demo_customers()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_demo_customers() FROM anon, authenticated';
  END IF;

  IF to_regprocedure('public.get_demo_customer(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_demo_customer(uuid) FROM anon, authenticated';
  END IF;

  IF to_regprocedure('public.demo_add_dog(text,text,text,uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.demo_add_dog(text,text,text,uuid) FROM anon, authenticated';
  END IF;
END
$$;
