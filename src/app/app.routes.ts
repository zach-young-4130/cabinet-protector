import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { ProductListComponent } from './features/shop/components/product-list/product-list.component';
import { ProductDetailComponent } from './features/shop/components/product-detail/product-detail.component';
import { CartComponent } from './features/cart/components/cart.component';
import { CheckoutComponent } from './features/checkout/components/checkout.component';
import { AboutComponent } from './features/about/about.component';
import { FaqComponent } from './features/faq/faq.component';
import { LoginComponent } from './features/auth/login.component';
import { SignupComponent } from './features/auth/signup.component';
import { VerifyEmailComponent } from './features/auth/verify-email.component';
import { ResetPasswordComponent } from './features/auth/reset-password.component';
import { ProfileComponent } from './features/account/profile/profile.component';
import { OrdersListComponent } from './features/account/orders/order-list/orders-list.component';
import { OrderDetailComponent } from './features/account/orders/order-detail/order-detail.component';
import { AdminOrderListComponent } from './features/admin/orders/order-list/order-list.component';
import { AdminOrderDetailComponent } from './features/admin/orders/order-detail/order-detail.component';
import { AdminUserListComponent } from './features/admin/users/user-list/user-list.component';
import { AdminInventoryComponent } from './features/admin/inventory/inventory.component';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    component: HomeComponent
  },
  {
    path: 'shop',
    children: [
      {
        path: '',
        component: ProductListComponent
      },
      {
        path: ':id',
        component: ProductDetailComponent
      }
    ]
  },
  {
    path: 'about',
    component: AboutComponent
  },
  {
    path: 'faq',
    component: FaqComponent
  },
  {
    path: 'cart',
    component: CartComponent
  },
  {
    path: 'checkout',
    component: CheckoutComponent
  },
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'signup',
    component: SignupComponent
  },
  {
    path: 'verify-email',
    component: VerifyEmailComponent
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        redirectTo: 'orders',
        pathMatch: 'full'
      },
      {
        path: 'orders',
        component: AdminOrderListComponent
      },
      {
        path: 'orders/:id',
        component: AdminOrderDetailComponent
      },
      {
        path: 'users',
        component: AdminUserListComponent
      },
      {
        path: 'inventory',
        component: AdminInventoryComponent
      }
    ]
  },
  {
    path: 'account',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        component: ProfileComponent
      },
      {
        path: 'orders',
        component: OrdersListComponent
      },
      {
        path: 'orders/:id',
        component: OrderDetailComponent
      }
    ]
  }
];
