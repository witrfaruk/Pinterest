-- 1. Create the pin_queue Table
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

-- Index for FIFO queue querying
CREATE INDEX IF NOT EXISTS idx_pin_queue_status_created ON public.pin_queue (status, created_at ASC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.pin_queue ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
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
