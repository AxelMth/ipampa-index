-- Create table for IPAMPA indices metadata
CREATE TABLE IF NOT EXISTS ipampa_indices (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  id_bank TEXT NOT NULL UNIQUE,
  last_update TEXT,
  period TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create table for IPAMPA values by year
CREATE TABLE IF NOT EXISTS ipampa_values (
  id SERIAL PRIMARY KEY,
  index_id INTEGER REFERENCES ipampa_indices(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  value NUMERIC(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(index_id, year)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ipampa_values_year ON ipampa_values(year);
CREATE INDEX IF NOT EXISTS idx_ipampa_values_index_id ON ipampa_values(index_id);
