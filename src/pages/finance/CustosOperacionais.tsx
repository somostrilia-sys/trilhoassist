import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useListarCustos, useRegistrarCusto, CATEGORIAS_CUSTO, formatCurrencyBR } from "@/hooks/useTrilhoFinanceiro";
import { Plus } from "lucide-react";

export default function CustosOperacionais() {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [catFilter, setCatFilter] = useState("todos");
  const [open, setOpen] = useState(false);
  const [formCat, setFormCat] = useState("guincho");
  const [formDesc, setFormDesc] = useState("");
  const [formValor, setFormValor] = useState("");
  const [formData, setFormData] = useState(format(now, "yyyy-MM-dd"));

  const { data, isLoading, refetch } = useListarCustos(dateFrom, dateTo, catFilter);
  const registrar = useRegistrarCusto();

  const custos: any[] = data?.custos ?? data ?? [];
  const totaisCat: Record<string, number> = data?.totais_por_categoria ?? {};

  const totaisArr = useMemo(() => {
    return Object.entries(totaisCat).map(([cat, val]) => ({ cat, val: val as number }));
  }, [totaisCat]);

  const handleSubmit = async () => {
    if (!formDesc || !formValor) return;
    try {
      await registrar.mutateAsync({
        categoria: formCat,
        descricao: formDesc,
        valor: parseFloat(formValor),
        data: formData,
      });
      toast.success("Custo registrado!");
      setOpen(false);
      setFormDesc("");
      setFormValor("");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Custos Operacionais</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Registrar Custo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Custo Operacional</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Select value={formCat} onValueChange={setFormCat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_CUSTO.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Descrição" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
              <Input type="number" placeholder="Valor (R$)" value={formValor} onChange={(e) => setFormValor(e.target.value)} />
              <Input type="date" value={formData} onChange={(e) => setFormData(e.target.value)} />
              <Button onClick={handleSubmit} disabled={registrar.isPending} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="date" className="border rounded-md px-3 py-2 text-sm bg-background" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input type="date" className="border rounded-md px-3 py-2 text-sm bg-background" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas categorias</SelectItem>
                {CATEGORIAS_CUSTO.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Totals by category */}
      {totaisArr.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {totaisArr.map((t) => (
            <Card key={t.cat}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground capitalize">{t.cat}</p>
                <p className="text-sm font-bold text-primary">{formatCurrencyBR(t.val)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : custos.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">Nenhum custo registrado no período</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {custos.map((c: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{c.data || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{c.categoria}</Badge></TableCell>
                    <TableCell>{c.descricao}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrencyBR(c.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
