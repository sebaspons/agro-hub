import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Badge, Modal } from "./index";

describe("Badge", () => {
  it("renderiza su contenido", () => {
    render(<Badge color="green">Activo</Badge>);
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("no renderiza nada cuando está cerrado", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Oculto">
        contenido
      </Modal>
    );
    expect(screen.queryByText("Oculto")).not.toBeInTheDocument();
  });

  it("muestra título y contenido cuando está abierto", () => {
    render(
      <Modal open onClose={() => {}} title="Nueva venta">
        <p>cuerpo</p>
      </Modal>
    );
    expect(screen.getByText("Nueva venta")).toBeInTheDocument();
    expect(screen.getByText("cuerpo")).toBeInTheDocument();
  });

  it("llama onClose al tocar la X", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        c
      </Modal>
    );
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
