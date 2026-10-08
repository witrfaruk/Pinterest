-- 2. Create the app_config Table for Secure Cloud Configuration
CREATE TABLE IF NOT EXISTS public.app_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'Service role full access app_config'
    ) THEN
        CREATE POLICY "Service role full access app_config" ON public.app_config
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- Seed default configuration
INSERT INTO public.app_config (key, value, description)
VALUES 
    ('SMTP_USER', 'farukhetro@gmail.com', 'Sender Gmail address for alert notifications'),
    ('SMTP_PASS', 'rvsrlaksnuyrzgvy', 'Google App Password for sender email'),
    ('ALERT_RECIPIENTS', 'mdarif59gdis@gmail.com,arif.pvt.9@gmail.com,farukflare@gmail.com', 'Comma-separated recipient emails for low queue alerts'),
    ('ALERT_THRESHOLD', '5', 'Minimum number of pending pins remaining before triggering alert email'),
    ('GOOGLE_SHEET_WEBHOOK_URL', 'https://script.google.com/macros/s/AKfycbzL5Y_L7j3n1h8OQ_B9a8X9p0K5V1Z2Y3X4W5V6U7/exec', 'Google Sheet webhook URL for Finmunt log sync')
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    updated_at = NOW();
