import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";

interface TruckVerificationData {
  truck_type: string;
  loaded: string;
  cargo_type: string;
  moves: string;
}

interface Props {
  data: TruckVerificationData;
  onChange: (field: keyof TruckVerificationData, value: string) => void;
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

export const defaultTruckVerification: TruckVerificationData = {
  truck_type: "",
  loaded: "",
  cargo_type: "",
  moves: "",
};

export default function TruckVerification({ data, onChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5" /> VERIFICAÇÃO DO CAMINHÃO
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Tipo de caminhão</Label>
          <Input value={data.truck_type} onChange={(e) => onChange("truck_type", e.target.value)} placeholder="Ex: Toco, Truck, Carreta, Bitrem..." />
        </div>

        <div className="space-y-2">
          <Label>Está carregado?</Label>
          <YesNoToggle value={data.loaded} onChange={(v) => onChange("loaded", v)} />
          {data.loaded === "yes" && (
            <Input placeholder="Qual carga?" value={data.cargo_type} onChange={(e) => onChange("cargo_type", e.target.value)} className="mt-2" />
          )}
        </div>

        <div className="space-y-2">
          <Label>O caminhão movimenta ou não?</Label>
          <YesNoToggle value={data.moves} onChange={(v) => onChange("moves", v)} />
        </div>
      </CardContent>
    </Card>
  );
}
