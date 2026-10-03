import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Create account · DataPilot" };

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
