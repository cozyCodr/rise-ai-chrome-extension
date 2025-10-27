const createCommandButton = (command, label) => {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.command = command;
  button.textContent = label;
  return button;
};

export class SimpleEditor {
  constructor({ root, initialHtml }) {
    this.root = root;
    this.initialHtml = initialHtml;
    this.toolbar = document.createElement("div");
    this.toolbar.className = "simple-editor-toolbar";
    this.surface = document.createElement("div");
    this.surface.className = "simple-editor-surface";
    this.surface.contentEditable = "true";
    this.surface.innerHTML = initialHtml;

    const commands = [
      { command: "bold", label: "Bold" },
      { command: "italic", label: "Italic" },
      { command: "insertunorderedlist", label: "Bullets" },
      { command: "insertorderedlist", label: "Numbered" },
    ];

    commands.forEach(({ command, label }) => {
      const button = createCommandButton(command, label);
      button.addEventListener("click", () => {
        document.execCommand(command, false);
        this.surface.focus({ preventScroll: true });
      });
      this.toolbar.appendChild(button);
    });

    const clearButton = createCommandButton("clear", "Clear");
    clearButton.addEventListener("click", () => {
      this.surface.innerHTML = "";
      this.surface.focus({ preventScroll: true });
    });
    this.toolbar.appendChild(clearButton);

    root.innerHTML = "";
    root.appendChild(this.toolbar);
    root.appendChild(this.surface);
  }

  getHtml() {
    return this.surface.innerHTML;
  }

  focus() {
    this.surface.focus({ preventScroll: true });
  }
}
