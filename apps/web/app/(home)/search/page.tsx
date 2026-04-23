import Link from "next/link";
import ProductsGrid from "@/components/products/products-grid";
import { getSearchProducts } from "@/lib/action/action";
import { redirect } from "next/navigation";

export default async function page({
  searchParams,
}: {
  searchParams: {
    search?: string;
  };
}) {
  const search = searchParams.search?.trim() ?? "";
  if (!search) {
    redirect("/products");
  }

  const products = await getSearchProducts(search);

  return (
    <div className="flex flex-col justify-center items-center gap-5 pt-4 px-4 sm:px-0">
      <h3 className="text-2xl text-center">
        Search results for <span className="font-bold">{search}</span>
      </h3>

      {products.length === 0 ? (
        <div className="space-y-4 text-center">
          <p className="text-lg text-muted-foreground">
            No products matched "{search}".
          </p>
          <Link
            href="/products"
            className="text-primary underline hover:text-primary/80"
          >
            Browse all products
          </Link>
        </div>
      ) : (
        <ProductsGrid products={products} />
      )}
    </div>
  );
}
