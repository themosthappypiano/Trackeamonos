-- Add visibility controls to items (public or private)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';
ALTER TABLE habits ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';
ALTER TABLE checklist ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';

-- Gratitude selective privacy (array of profile IDs that cannot see the entry)
ALTER TABLE gratitudes ADD COLUMN IF NOT EXISTS hidden_from uuid[] DEFAULT '{}';

-- Profile section visibility (array of sections hidden by this user: 'tasks', 'habits', 'checklist', 'gratitude')
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hidden_sections text[] DEFAULT '{}';
