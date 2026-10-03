-- ========================================================
-- AI Video Content Generator - Supabase PostgreSQL Schema
-- Phase 2: Authentication & Database Foundation
-- ========================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------
-- 1. Table: profiles
-- Linked 1-to-1 with Supabase auth.users
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS Policies: users can only read & update their own profile
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- --------------------------------------------------------
-- 2. Table: creator_profiles
-- Stores creator persona & content generation preferences
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  niche TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'English',
  tone TEXT NOT NULL DEFAULT 'Friendly',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_profiles_user_id ON public.creator_profiles(user_id);

-- Enable RLS on creator_profiles
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

-- Creator Profiles RLS Policies: strict user ownership
CREATE POLICY "Users can view their own creator profile"
  ON public.creator_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own creator profile"
  ON public.creator_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own creator profile"
  ON public.creator_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own creator profile"
  ON public.creator_profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- --------------------------------------------------------
-- 3. Table: projects
-- Represents video projects uploaded or linked by creators
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'upload', -- 'upload' | 'url'
  source_url TEXT,
  video_status TEXT NOT NULL DEFAULT 'queued', -- 'uploading' | 'queued' | 'transcribing' | 'analyzing' | 'generating' | 'complete' | 'failed'
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(video_status);

-- Enable RLS on projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Projects RLS Policies: users can only manage their own projects
CREATE POLICY "Users can view their own projects"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- --------------------------------------------------------
-- 4. Table: content_outputs
-- Stores platform-specific generated content items
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,      -- 'youtube' | 'instagram' | 'shorts' | 'linkedin' | 'x'
  content_type TEXT NOT NULL,  -- 'title' | 'description' | 'chapters' | 'keywords' | 'hook' | 'caption' | 'hashtags' | 'moment' | 'post' | 'thread'
  content TEXT NOT NULL DEFAULT '',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_outputs_project_id ON public.content_outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_content_outputs_platform ON public.content_outputs(platform);

-- Enable RLS on content_outputs
ALTER TABLE public.content_outputs ENABLE ROW LEVEL SECURITY;

-- Content Outputs RLS Policies: access determined via project ownership
CREATE POLICY "Users can view content outputs for their own projects"
  ON public.content_outputs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.content_outputs.project_id
        AND public.projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert content outputs for their own projects"
  ON public.content_outputs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.content_outputs.project_id
        AND public.projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update content outputs for their own projects"
  ON public.content_outputs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.content_outputs.project_id
        AND public.projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.content_outputs.project_id
        AND public.projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete content outputs for their own projects"
  ON public.content_outputs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.content_outputs.project_id
        AND public.projects.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------
-- 5. Automatic Profile Provisioning Trigger
-- Runs whenever a new user signs up via Supabase Auth
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  extracted_name TEXT;
BEGIN
  extracted_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Insert profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, extracted_name)
  ON CONFLICT (id) DO NOTHING;

  -- Insert default creator preferences
  INSERT INTO public.creator_profiles (user_id, niche, target_audience, language, tone)
  VALUES (NEW.id, '', '', 'English', 'Friendly')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------
-- 6. Updated At Automatic Timestamp Trigger
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_creator_profiles_updated_at
  BEFORE UPDATE ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_content_outputs_updated_at
  BEFORE UPDATE ON public.content_outputs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
