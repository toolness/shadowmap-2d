export function getElement(tagName, id) {
    const selector = `${tagName}#${id}`;
    const el = document.querySelector(selector);
    if (!el) {
        throw new Error(`Unable to find <${tagName} id="${id}">!`);
    }
    return el;
}
export function getLabelFor(element) {
    if (!element.id) {
        throw new Error("Element does not have an ID");
    }
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (!label) {
        throw new Error(`Label not found for #${element.id}`);
    }
    return label;
}
