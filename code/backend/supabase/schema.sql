-- ============================================================================
-- Supabase Schema & pg_cron Setup for Finmunt Pinterest Automation
-- Run this in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create the pin_queue Table
CREATE TABLE IF NOT EXISTS public.pin_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_path TEXT NOT NULL,
    image_url TEXT NOT NULL,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL,
    alt_text VARCHAR(500),
    tags TEXT,
    board_id VARCHAR(100) NOT NULL,
    board_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    tries INT DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast FIFO queue querying
CREATE INDEX IF NOT EXISTS idx_pin_queue_status_created ON public.pin_queue (status, created_at ASC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.pin_queue ENABLE ROW LEVEL SECURITY;

-- Allow service_role root access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pin_queue' AND policyname = 'Service role full access'
    ) THEN
        CREATE POLICY "Service role full access" ON public.pin_queue
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 3. Storage Bucket Configuration
INSERT INTO storage.buckets (id, name, public)
VALUES ('pinterest-queue', 'pinterest-queue', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage Bucket Policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read pinterest-queue'
    ) THEN
        CREATE POLICY "Public read pinterest-queue" ON storage.objects
            FOR SELECT
            TO public
            USING (bucket_id = 'pinterest-queue');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Service role full storage access'
    ) THEN
        CREATE POLICY "Service role full storage access" ON storage.objects
            FOR ALL
            TO service_role
            USING (bucket_id = 'pinterest-queue')
            WITH CHECK (bucket_id = 'pinterest-queue');
    END IF;
END $$;

-- 5. pg_cron Scheduling (5 Daily Publishing Slots in UTC)
-- 5:30 PM IST  -> 12:00 UTC
-- 7:30 PM IST  -> 14:00 UTC
-- 9:30 PM IST  -> 16:00 UTC
-- 11:30 PM IST -> 18:00 UTC
-- 1:30 AM IST  -> 20:00 UTC

-- Remove existing jobs if re-running
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'pinterest_slot_%';

-- Schedule Slot 1: 17:30 IST (12:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_1730_ist',
    '0 12 * * *',
    $$
    SELECT net.http_post(
        url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Schedule Slot 2: 19:30 IST (14:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_1930_ist',
    '0 14 * * *',
    $$
    SELECT net.http_post(
        url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Schedule Slot 3: 21:30 IST (16:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_2130_ist',
    '0 16 * * *',
    $$
    SELECT net.http_post(
        url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Schedule Slot 4: 23:30 IST (18:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_2330_ist',
    '0 18 * * *',
    $$
    SELECT net.http_post(
        url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Schedule Slot 5: 01:30 IST (20:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_0130_ist',
    '0 20 * * *',
    $$
    SELECT net.http_post(
        url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    );
    $$
);
