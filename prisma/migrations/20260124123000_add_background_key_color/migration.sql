-- Create enum for background key color
CREATE TYPE "BackgroundKeyColor" AS ENUM ('WHITE', 'GREEN');

-- Add background key color to agents
ALTER TABLE "agents" ADD COLUMN "backgroundKeyColor" "BackgroundKeyColor";
