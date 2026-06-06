import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider, useI18n } from "./i18n";

function Probe() {
  const { t, lang, setLang } = useI18n();
  return (
    <div>
      <span data-testid="save">{t("Guardar")}</span>
      <span data-testid="welcome">{t("¡Bienvenido, {name}!", { name: "Ana" })}</span>
      <span data-testid="unknown">{t("Texto sin traducir")}</span>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang("en")}>en</button>
    </div>
  );
}

describe("i18n", () => {
  beforeEach(() => localStorage.clear());

  it("usa español por defecto (clave = español)", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(screen.getByTestId("save").textContent).toBe("Guardar");
    expect(screen.getByTestId("welcome").textContent).toBe("¡Bienvenido, Ana!");
  });

  it("traduce al inglés al cambiar de idioma", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    fireEvent.click(screen.getByText("en"));
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("save").textContent).toBe("Save");
    expect(screen.getByTestId("welcome").textContent).toBe("Welcome, Ana!");
  });

  it("devuelve la clave si no hay traducción", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    fireEvent.click(screen.getByText("en"));
    expect(screen.getByTestId("unknown").textContent).toBe("Texto sin traducir");
  });
});
