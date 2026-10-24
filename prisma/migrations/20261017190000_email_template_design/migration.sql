-- Ajuste 12: diseño editable de los correos sin tocar código.
-- Cada versión (append-only) guarda un color de acento de la paleta cerrada y un
-- ícono de cabecera; NULL = los del tema del evento. Los GRANT existentes
-- (SELECT, INSERT a nivel de tabla) ya cubren las columnas nuevas.
ALTER TABLE "email_template_versions"
  ADD COLUMN "accent_color" TEXT,
  ADD COLUMN "icon" TEXT;

ALTER TABLE "email_template_versions"
  ADD CONSTRAINT "email_template_versions_accent_color_check"
    CHECK ("accent_color" IS NULL OR "accent_color" IN ('teal', 'navy', 'coral', 'gold', 'blue', 'red', 'purple', 'green')),
  ADD CONSTRAINT "email_template_versions_icon_check"
    CHECK ("icon" IS NULL OR char_length("icon") <= 8);
