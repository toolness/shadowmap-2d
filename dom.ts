export function getElement<K extends keyof HTMLElementTagNameMap>(tagName: K, id: string): HTMLElementTagNameMap[K] {
    const selector = `${tagName}#${id}`;
    const el = document.querySelector(selector);
    if (!el) {
        throw new Error(`Unable to find <${tagName} id="${id}">!`);
    }
    return el as any;
}

export function getLabelFor(element: HTMLElement): HTMLLabelElement {
    if (!element.id) {
        throw new Error("Element does not have an ID");
    }
    const label = document.querySelector(`label[for="${element.id}"]`) as HTMLLabelElement|null;
    if (!label) {
        throw new Error(`Label not found for #${element.id}`);
    }
    return label;
}
