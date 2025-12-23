-- 1. Create the profiles table
-- This table stores public user data and ensures that 'name' is unique.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT name_length CHECK (char_length(name) >= 3)
);

-- 2. Enable Row Level Security (RLS) on the profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create policies for the profiles table
-- This policy allows anyone to view all profiles.
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING ( true );

-- This policy allows users to insert their own profile.
CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK ( auth.uid() = id );

-- This policy allows users to update their own profile.
CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING ( auth.uid() = id );

-- 4. Create the function to handle new user creation
-- This function automatically inserts a new row into public.profiles
-- when a new user signs up. It pulls the 'name' from the user's metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (new.id, new.raw_user_meta_data->>'name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create the trigger
-- This trigger calls the handle_new_user function after a new user is created.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. (Optional but Recommended) Add a function to check if a name is taken
-- This can be called from the client-side to provide instant feedback to the user.
CREATE OR REPLACE FUNCTION public.is_name_taken(p_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  is_taken BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE name = p_name
  ) INTO is_taken;
  RETURN is_taken;
END;
$$ LANGUAGE plpgsql;
