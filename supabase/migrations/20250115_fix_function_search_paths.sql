-- Fix search_path for update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix search_path for handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    NOW(),
    NOW()
  );
  
  -- Create default user preferences
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Add comment explaining the security improvement
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Automatically updates updated_at timestamp. Search path secured to prevent injection attacks.';
COMMENT ON FUNCTION public.handle_new_user() IS 'Creates user record and preferences when new auth user is created. Search path secured to prevent injection attacks.';