ALTER TABLE "profile" ALTER COLUMN "last_tested" SET DATA TYPE text USING to_char("last_tested", 'YYYY-MM-DD');
