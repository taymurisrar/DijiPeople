declare global {
  interface Window {
    dijiAgent: {
      login: (
        email: string,
        password: string,
      ) => Promise<{ ok: boolean; message?: string }>;
      onLoginError: (callback: (message: string) => void) => void;
    };
  }
}

const form = document.querySelector<HTMLFormElement>("#login-form");
const email = document.querySelector<HTMLInputElement>("#email");
const password = document.querySelector<HTMLInputElement>("#password");
const submit = document.querySelector<HTMLButtonElement>("#submit");
const error = document.querySelector<HTMLDivElement>("#error");

function setError(message: string) {
  if (error) error.textContent = message;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");
  if (!email?.value || !password?.value || !submit) return;

  submit.disabled = true;
  submit.textContent = "Signing in...";

  const result = await window.dijiAgent.login(email.value, password.value);
  if (!result.ok) {
    setError(result.message ?? "Unable to sign in.");
  }

  submit.disabled = false;
  submit.textContent = "Sign in";
});

window.dijiAgent.onLoginError(setError);

export {};
