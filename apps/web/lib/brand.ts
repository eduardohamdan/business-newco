/**
 * Nome da marca num lugar só. "Tento" é o nome provisório (ver docs/design/interface-ideal.html,
 * aba Identidade). Ainda depende da busca no INPI (classes 9, 35 e 42), em especial frente às
 * marcas da 3tentos. Trocar o nome = mudar este arquivo e public/manifest.webmanifest.
 * "Business Evolution OS" segue como nome interno do projeto e dos pacotes (@beos/*).
 */
export const BRAND = {
  name: "Tento",
  shortName: "Tento",
  tagline: "Tome tento da sua empresa. Cinco minutos por semana.",
  themeColor: "#2440c8",
} as const;
