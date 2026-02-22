import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";

interface MotorcycleVerificationData {
  wheel_locked: string;
  people_count: string;
  easy_access: string;
  docs_key_available: string;
}

interface Props {
  data: MotorcycleVerificationData;
  onChange: (field: keyof MotorcycleVerificationData, value: string) => void;
}

function YesNoToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" variant={value === "yes" ? "default" : "outline"} onClick={() => onChange("yes")}>
        Sim
      </Button>
      <Button type="button" size="sm" variant={value === "no" ? "default" : "outline"} onClick={() => onChange("no")}>
        Não
      </Button>
    </div>
  );
}

export const defaultMotorcycleVerification: MotorcycleVerificationData = {
  wheel_locked: "",
  people_count: "",
  easy_access: "",
  docs_key_available: "",
};

export default function MotorcycleVerification({ data, onChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5" /> VERIFICAÇÃO DA MOTOCICLETA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>A motocicleta está com roda travada?</Label>
          <YesNoToggle value={data.wheel_locked} onChange={(v) => onChange("wheel_locked", v)} />
        </div>

        <div className="space-y-2">
          <Label>Há quantas pessoas no local?</Label>
          <Input type="number" value={data.people_count} onChange={(e) => onChange("people_count", e.target.value)} placeholder="Número de pessoas" />
        </div>

        <div className="space-y-2">
          <Label>A motocicleta está em local de fácil acesso para remoção?</Label>
          <YesNoToggle value={data.easy_access} onChange={(v) => onChange("easy_access", v)} />
        </div>

        <div className="space-y-2">
          <Label>Os documentos e a chave estão no local?</Label>
          <YesNoToggle value={data.docs_key_available} onChange={(v) => onChange("docs_key_available", v)} />
        </div>
      </CardContent>
    </Card>
  );
}
