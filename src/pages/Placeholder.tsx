import { useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function Placeholder() {
  const location = useLocation();
  
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <Construction className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">Em construção</h2>
          <p className="text-muted-foreground text-sm">
            O módulo <code className="bg-muted px-1 rounded">{location.pathname}</code> está sendo desenvolvido.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
