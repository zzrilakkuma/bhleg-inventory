-- 1. Add image_urls column to records table
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- 2. Ensure RLS is enabled (if not already)
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

-- 3. (Optional) Create a storage bucket for record images via SQL 
-- Note: It's often easier to create the bucket 'record-images' manually in the Supabase Dashboard.
-- But we can set up the security policies here.

-- Allow public access to read images (adjust if you want them private)
CREATE POLICY "Public Access to Record Images"
ON storage.objects FOR SELECT
USING ( bucket_id = 'record-images' );

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload record images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'record-images' );
