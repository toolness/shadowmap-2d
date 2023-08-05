export async function fetchShader(device: GPUDevice, filename: string): Promise<GPUShaderModule> {
    const response = await fetch(filename);
    if (!response.ok) {
        throw new Error(`Fetching "${filename}" failed, status code ${response.status}`);
    }
    const code = await response.text();
    return device.createShaderModule({
        label: filename,
        code
    });
}
