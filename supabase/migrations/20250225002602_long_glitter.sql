/*
  # Fix User Creation Flow

  1. Changes
    - Add missing email column to profiles if not exists
    - Add unique constraint on email
    - Update profile policies to allow creation during signup
    - Add trigger to sync email from auth.users
*/

-- Add email column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email text;
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
  END IF;
END $$;

-- Drop existing policies
DROP POLICY IF EXISTS "allow_public_read_profiles" ON profiles;
DROP POLICY IF EXISTS "allow_profile_creation" ON profiles;
DROP POLICY IF EXISTS "allow_profile_updates" ON profiles;

-- Create new policies
CREATE POLICY "allow_public_read_profiles"
  ON profiles
  FOR SELECT
  USING (true);

CREATE POLICY "allow_profile_creation"
  ON profiles
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "allow_profile_updates"
  ON profiles
  FOR UPDATE
  USING (
    auth.uid() = id OR
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'role')::text = 'manager'
    )
  );

-- Create a function to sync email from auth.users
CREATE OR REPLACE FUNCTION sync_user_email()
RETURNS trigger AS $$
BEGIN
  UPDATE profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to sync email when user is created or updated
DROP TRIGGER IF EXISTS sync_user_email ON auth.users;
CREATE TRIGGER sync_user_email
  AFTER INSERT OR UPDATE OF email
  ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_email();

-- Sync existing emails
UPDATE profiles
SET email = users.email
FROM auth.users
WHERE profiles.id = users.id
  AND profiles.email IS NULL;