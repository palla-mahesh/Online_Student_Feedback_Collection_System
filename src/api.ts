let memoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (memoryToken) {
    headers.Authorization = `Bearer ${memoryToken}`;
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errMsg = `Request failed (${response.status})`;
    try {
      const errBody = (await response.json()) as { error?: string };
      if (errBody?.error) errMsg = errBody.error;
    } catch {
      // ignore non-JSON error
    }
    throw new Error(errMsg);
  }

  return (await response.json()) as T;
}

export async function downloadAuthenticatedBlob(path: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (memoryToken) {
    headers.Authorization = `Bearer ${memoryToken}`;
  }
  const response = await fetch(`/api${path}`, { headers });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
