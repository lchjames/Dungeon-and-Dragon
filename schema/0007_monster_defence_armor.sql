PRAGMA foreign_keys = ON;

ALTER TABLE monster_templates ADD COLUMN stored_defence REAL NOT NULL DEFAULT 0;
ALTER TABLE monster_templates ADD COLUMN armor_name TEXT NOT NULL DEFAULT '';
ALTER TABLE monster_templates ADD COLUMN armor_defence REAL NOT NULL DEFAULT 0;
ALTER TABLE monster_templates ADD COLUMN armor_notes TEXT NOT NULL DEFAULT '';

ALTER TABLE monster_instances ADD COLUMN stored_defence REAL NOT NULL DEFAULT 0;
ALTER TABLE monster_instances ADD COLUMN defence_modifier REAL NOT NULL DEFAULT 0;
ALTER TABLE monster_instances ADD COLUMN armor_name TEXT NOT NULL DEFAULT '';
ALTER TABLE monster_instances ADD COLUMN armor_base_defence REAL NOT NULL DEFAULT 0;
ALTER TABLE monster_instances ADD COLUMN armor_defence_adjustment REAL NOT NULL DEFAULT 0;
ALTER TABLE monster_instances ADD COLUMN final_armor_defence REAL NOT NULL DEFAULT 0;
ALTER TABLE monster_instances ADD COLUMN armor_notes TEXT NOT NULL DEFAULT '';
