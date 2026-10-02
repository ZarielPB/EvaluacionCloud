export function Footer() {
  return (
    <footer className="mt-16 border-t border-borde bg-superficie">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-tinta-suave sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-bold text-tinta">LOMAX SA</span> · Tecnologias Emergentes I · Etapa 5
          Frontend
        </p>
        <p>
          Datos en RDS y DynamoDB, imagenes en S3, miniaturas generadas por AWS Lambda.
        </p>
      </div>
    </footer>
  );
}
