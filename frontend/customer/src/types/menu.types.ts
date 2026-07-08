export interface Category {
  name: string
  imageUrl: string | null
}

export interface ProductOptionGroup {
  title: string
  type: 'single' | 'multi'
  values: string[]
}

export interface Product {
  id: string
  name: string
  price: number
  category: string
  imageUrl: string
  ingredients: string
  options: ProductOptionGroup[]
  isAvailable: boolean
}
