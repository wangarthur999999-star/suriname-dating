-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  interested_in TEXT NOT NULL CHECK (interested_in IN ('male', 'female', 'everyone')),
  bio TEXT,
  avatar_url TEXT,
  whatsapp TEXT,
  location GEOGRAPHY(POINT, 4326),
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  last_active TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Likes table
CREATE TABLE IF NOT EXISTS public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (from_user, to_user)
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own likes"
  ON public.likes FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "Users can create likes"
  ON public.likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user);

-- Matches view (bidirectional likes)
CREATE OR REPLACE VIEW public.matches AS
SELECT
  l1.from_user AS user_a,
  l1.to_user AS user_b,
  l1.created_at AS matched_at
FROM public.likes l1
JOIN public.likes l2
  ON l1.from_user = l2.to_user
  AND l1.to_user = l2.from_user
WHERE l1.from_user < l1.to_user;

-- Function: get_nearby_profiles
CREATE OR REPLACE FUNCTION get_nearby_profiles(
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  max_distance_meters DOUBLE PRECISION DEFAULT 50000,
  limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  nickname TEXT,
  bio TEXT,
  gender TEXT,
  avatar_url TEXT,
  distance_meters DOUBLE PRECISION
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.nickname,
    p.bio,
    p.gender,
    p.avatar_url,
    ST_Distance(p.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) AS distance_meters
  FROM public.profiles p
  WHERE p.location IS NOT NULL
    AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, max_distance_meters)
    AND p.id != auth.uid()
  ORDER BY distance_meters
  LIMIT limit_count;
$$;

-- Function: has_mutual_like
CREATE OR REPLACE FUNCTION has_mutual_like(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.likes l1
    JOIN public.likes l2
      ON l1.from_user = l2.to_user
      AND l1.to_user = l2.from_user
    WHERE l1.from_user = user_a AND l1.to_user = user_b
  );
$$;

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
