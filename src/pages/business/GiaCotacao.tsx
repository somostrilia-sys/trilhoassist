import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Calculator, MessageSquare, TrendingUp, DollarSign, ShieldCheck } from "lucide-react";

const GIA_URL = "https://yrjiegtqfngdliwclpzo.supabase.co/functions/v1";
const GIA_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyamllZ3RxZm5nZGxpd2NscHpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI3NTIyMzksImV4cCI6MjA1ODMyODIzOX0.bhlDxOOQAHFqBRkOT0oY5IOY5bZ3FBQG0P5DaD0CGPI";

const PLAN_VALUES: Record<string, number> = {
  basico: 149.9,
  intermediario: 199.9,
  completo: 299.9,
};

interface CotacaoResult {
  plano_base: number;
  taxa_admin: number;
  total_mensal: number;
}

interface AssociadoInfo {
  nome: string;
  documento: string;
}

export default function GiaCotacao() {
  const { toast } = useToast();

  const [documento, setDocumento] = useState("");
  const [placa, setPlaca] = useState("");
  const [tipoVeiculo, setTipoVeiculo] = useState("");
  const [regiao, setRegiao] = useState("");
  const [plano, setPlano] = useState("");

  const [associado, setAssociado] = useState<AssociadoInfo | null>(null);
  const [buscandoAssociado, setBuscandoAssociado] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<CotacaoResult | null>(null);

  const formatDoc = (val: string) => val.replace(/\D/g, "");

  async function buscarAssociado() {
    const doc = formatDoc(documento);
    if (!doc || (doc.length !== 11 && doc.length !== 14)) {
      toast({ title: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.", variant: "destructive" });
      return;
    }
    setBuscandoAssociado(true);
    setAssociado(null);
    try {
      const { data, error } = await supabase
        .from("beneficiaries")
        .select("name, cpf")
        .or(`cpf.eq.${doc},cnpj.eq.${doc}`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAssociado({ nome: data.name, documento: doc });
      } else {
        toast({ title: "Associado não encontrado no SGA.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao buscar associado no SGA.", variant: "destructive" });
    } finally {
      setBuscandoAssociado(false);
    }
  }

  async function calcularCotacao(e: React.FormEvent) {
    e.preventDefault();

    if (!plano || !tipoVeiculo || !regiao) {
      toast({ title: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const valorPlano = PLAN_VALUES[plano];
    setCalculando(true);
    setResultado(null);

    try {
      const response = await fetch(`${GIA_URL}/calcular-taxa-admin`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GIA_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ valor_plano: valorPlano, company_id: "objetivo" }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Normalise response fields (GIA may return different key names)
      const taxaAdmin: number =
        data.taxa_admin ?? data.taxaAdmin ?? data.taxa ?? 0;
      const planoBase: number =
        data.plano_base ?? data.planoBase ?? data.valor_base ?? valorPlano;
      const totalMensal: number =
        data.total_mensal ?? data.totalMensal ?? data.total ?? planoBase + taxaAdmin;

      setResultado({ plano_base: planoBase, taxa_admin: taxaAdmin, total_mensal: totalMensal });
    } catch (err: any) {
      toast({
        title: "Erro ao calcular cotação",
        description: err?.message ?? "Verifique a conexão com o GIA.",
        variant: "destructive",
      });
    } finally {
      setCalculando(false);
    }
  }

  const formatBRL = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cotação GIA</h1>
        <p className="text-sm text-muted-foreground">
          Calcule taxas e planos via Objetivo Proteção Veicular
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                Dados para cotação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={calcularCotacao} className="space-y-5">
                {/* CPF/CNPJ */}
                <div className="space-y-1.5">
                  <Label htmlFor="documento">CPF / CNPJ do associado</Label>
                  <div className="flex gap-2">
                    <Input
                      id="documento"
                      placeholder="Somente números"
                      value={documento}
                      onChange={(e) => {
                        setDocumento(e.target.value);
                        setAssociado(null);
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={buscarAssociado}
                      disabled={buscandoAssociado}
                      className="gap-2"
                    >
                      <Search className="h-4 w-4" />
                      {buscandoAssociado ? "Buscando..." : "Buscar"}
                    </Button>
                  </div>
                  {associado && (
                    <p className="text-sm text-green-600 font-medium">
                      ✓ {associado.nome}
                    </p>
                  )}
                </div>

                {/* Placa */}
                <div className="space-y-1.5">
                  <Label htmlFor="placa">Placa do veículo</Label>
                  <Input
                    id="placa"
                    placeholder="ABC-1234 ou ABC1D23"
                    value={placa}
                    onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                    maxLength={8}
                  />
                </div>

                {/* Tipo + Região */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Tipo de veículo</Label>
                    <Select value={tipoVeiculo} onValueChange={setTipoVeiculo}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="automovel">Automóvel</SelectItem>
                        <SelectItem value="moto">Moto</SelectItem>
                        <SelectItem value="pesado">Pesado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Região</Label>
                    <Select value={regiao} onValueChange={setRegiao}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sudeste">Sudeste</SelectItem>
                        <SelectItem value="sul">Sul</SelectItem>
                        <SelectItem value="norte">Norte</SelectItem>
                        <SelectItem value="nordeste">Nordeste</SelectItem>
                        <SelectItem value="centro_oeste">Centro-Oeste</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Plano */}
                <div className="space-y-1.5">
                  <Label>Plano</Label>
                  <Select value={plano} onValueChange={setPlano}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um plano" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basico">Básico — {formatBRL(PLAN_VALUES.basico)}/mês</SelectItem>
                      <SelectItem value="intermediario">Intermediário — {formatBRL(PLAN_VALUES.intermediario)}/mês</SelectItem>
                      <SelectItem value="completo">Completo — {formatBRL(PLAN_VALUES.completo)}/mês</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full gap-2" disabled={calculando}>
                  <Calculator className="h-4 w-4" />
                  {calculando ? "Calculando..." : "Calcular cotação"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Result */}
        <div className="space-y-4">
          {resultado ? (
            <>
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Plano Base</p>
                    <p className="text-xl font-bold">{formatBRL(resultado.plano_base)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Taxa Admin</p>
                    <p className="text-xl font-bold">{formatBRL(resultado.taxa_admin)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Mensal</p>
                    <p className="text-2xl font-bold text-green-700">{formatBRL(resultado.total_mensal)}</p>
                  </div>
                </CardContent>
              </Card>

              <Button variant="outline" className="w-full gap-2" disabled>
                <MessageSquare className="h-4 w-4" />
                Enviar cotação pelo WhatsApp
              </Button>
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                <Calculator className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Preencha o formulário e calcule para ver os resultados aqui.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
