-- Unifica descrizione breve e-commerce: contenuto da docDescription -> seoAiText, poi elimina la colonna.
-- Esegui prima di `prisma db push` se il client Prisma non include più docDescription.

UPDATE `ProductText`
SET `seoAiText` = `docDescription`
WHERE (`seoAiText` IS NULL OR TRIM(`seoAiText`) = '')
  AND `docDescription` IS NOT NULL
  AND TRIM(`docDescription`) <> '';

UPDATE `StagingProductText`
SET `seoAiText` = `docDescription`
WHERE (`seoAiText` IS NULL OR TRIM(`seoAiText`) = '')
  AND `docDescription` IS NOT NULL
  AND TRIM(`docDescription`) <> '';

ALTER TABLE `ProductText` DROP COLUMN `docDescription`;
ALTER TABLE `StagingProductText` DROP COLUMN `docDescription`;
