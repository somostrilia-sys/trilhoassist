import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAjustarFechamento, useAprovarFechamento, usePagarFechamento, useCancelarFechamento, formatCurrencyBR } from "@/hooks/useTrilhoFinanceiro";
import { ArrowLeft, Plus, Minus, CheckCircle, Ban, DollarSign } from "lucide-react";

interface Props {
  fechamento: any;
  fechamentoId: string;
  onBack: () => void;
}

export default function FechamentoDetalhe({ fechamento, fechamentoId, onBack }: Props) {
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteTipo, setAjusteTipo] = useState("desconto");
  const [ajusteDescricao, setAjusteDescricao] = useState("");
  const [ajusteValor, setAjusteValor] = useState("");
  const [cancelObs, setCancelObs] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  const ajustar = useAjustarFechamento();
  const aprovar = useAprovarFechamento();
  const pagar = usePagarFechamento();
  const cancelar = useCancelarFechamento();

  const f = fechamento || {};
  const itens: any[] = f.itens || f.items || [];
  const ajustes: any[] = f.ajustes || [];

  const handleAjuste = async () => {
    if (!ajusteDescricao || !ajusteValor) return;
    const val = parseFloat(ajusteValor);
    try {
      await ajustar.mutateAsync({
        fechamento_id: fechamentoId,
        tipo: ajusteTipo,
        descricao: ajusteDescricao,
        valor: ajusteTipo === "desconto" || ajusteTipo === "multa" ? -Math.abs(val) : Math.abs(val),
      });
      toast.success("Ajuste registrado!");
      setAjusteOpen(false);
      setAjusteDescricao("");
      setAjusteValor("");
      onBack();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAprovar = async () => {
    try {
      await aprovar.mutateAsync({ fechamento_id: fechamentoId, aprovado_por: "admin" });
      toast.success("Fechamento aprovado!");
      onBack();
    } catch (e: any) { toast.error(e.message); }
  };

  const handlePagar = async () => {
    try {
      await pagar.mutateAsync({ fechamento_id: fechamentoId });
      toast.success("Marcado como pago!");
      onBack();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleCancelar = async () => {
    try {
      await cancelar.mutateAsync({ fechamento_id: fechamentoId, observacoes: cancelObs });
      toast.success("Fechamento cancelado.");
      setCancelOpen(false);
      onBack();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Button variant="ghost" onClick={onBack} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
      </Button>

      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{f.prestador_nome || f.nome || "Prestador"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Cidade:</span> <strong>{f.cidade || "—"}</strong></div>
            <div><span className="text-muted-foreground">Telefone:</span> <strong>{f.telefone || "—"}</strong></div>
            <div><span className="text-muted-foreground">PIX:</span> <strong>{f.pix || "—"}</strong></div>
            <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="ml-1">{f.status || "aberto"}</Badge></div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Atendimentos", value: f.total_atendimentos ?? f.atendimentos ?? 0, fmt: false },
          { label: "Valor Bruto", value: f.valor_bruto, fmt: true },
          { label: "Descontos", value: f.descontos, fmt: true, color: "text-destructive" },
          { label: "Acréscimos", value: f.acrescimos, fmt: true, color: "text-emerald-600" },
          { label: "Valor Líquido", value: f.valor_liquido, fmt: true, color: "text-primary" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-lg font-bold ${s.color || ""}`}>{s.fmt ? formatCurrencyBR(s.value) : s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Atendimentos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {itens.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum item</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{item.os || item.protocol || "—"}</TableCell>
                    <TableCell>{item.cliente || item.client_name || "—"}</TableCell>
                    <TableCell>{item.placa || item.plate || "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrencyBR(item.valor || item.value)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.data || item.date || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Adjustments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Ajustes</CardTitle>
          <Dialog open={ajusteOpen} onOpenChange={setAjusteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" /> Ajuste
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Ajuste</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Select value={ajusteTipo} onValueChange={setAjusteTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desconto">Desconto</SelectItem>
                    <SelectItem value="acrescimo">Acréscimo</SelectItem>
                    <SelectItem value="bonus">Bônus</SelectItem>
                    <SelectItem value="multa">Multa</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Descrição" value={ajusteDescricao} onChange={(e) => setAjusteDescricao(e.target.value)} />
                <Input type="number" placeholder="Valor (R$)" value={ajusteValor} onChange={(e) => setAjusteValor(e.target.value)} />
                <Button onClick={handleAjuste} disabled={ajustar.isPending} className="w-full">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {ajustes.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">Nenhum ajuste</p>
          ) : (
            <div className="space-y-2">
              {ajustes.map((a: any, i: number) => (
                <div key={i} className="flex justify-between items-center border rounded-lg px-4 py-2">
                  <div>
                    <span className="text-sm font-medium">{a.descricao || a.tipo}</span>
                    <Badge variant="outline" className="ml-2 text-xs">{a.tipo}</Badge>
                  </div>
                  <span className={`font-semibold ${a.valor < 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {formatCurrencyBR(a.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      {f.status !== "cancelado" && f.status !== "pago" && (
        <div className="flex flex-wrap gap-3">
          {f.status === "aberto" && (
            <Button onClick={handleAprovar} disabled={aprovar.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle className="h-4 w-4 mr-2" /> Aprovar
            </Button>
          )}
          {(f.status === "aprovado" || f.status === "aberto") && (
            <Button onClick={handlePagar} disabled={pagar.isPending} variant="default">
              <DollarSign className="h-4 w-4 mr-2" /> Marcar como Pago
            </Button>
          )}
          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Ban className="h-4 w-4 mr-2" /> Cancelar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Cancelar Fechamento</DialogTitle></DialogHeader>
              <Textarea placeholder="Motivo do cancelamento..." value={cancelObs} onChange={(e) => setCancelObs(e.target.value)} />
              <Button variant="destructive" onClick={handleCancelar} disabled={cancelar.isPending} className="w-full">Confirmar Cancelamento</Button>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
