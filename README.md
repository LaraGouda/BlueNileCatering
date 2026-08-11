# Blue Nile Catering

A custom catering website for Blue Nile Mediterranean Grill, made to help customers browse the menu, build a catering order, and send everything to the kitchen in a clear, organized way.

This project is meant to feel warm, simple, and useful. Customers can look through trays, desserts, drinks, add-ons, delivery details, and payment authorization without needing to call back and forth for every little detail. The cook gets the order details in a dashboard, and customers can come back to check their orders.

Built with care by Lara Gouda for Blue Nile. :)

## What It Does

- Shows a full catering menu with categories, options, quantities, and drink customization.
- Lets customers build a cart and submit a catering request.
- Handles order details like date, time, address, guest count, paper supplies, and individually wrapped meals.
- Uses Stripe for payment authorization before the kitchen confirms the order.
- Sends order information to Google Sheets so the business has a simple backend record.
- Sends email notifications with Resend.
- Includes a private dashboard for reviewing, confirming, charging, declining, and managing orders.

## Tools Used

- React and TypeScript for the app UI.
- TanStack Start and TanStack Router for routing and server functions.
- Tailwind CSS for styling.
- Radix UI and shadcn-style components for dialogs, sheets, forms, and controls.
- Stripe for secure payment authorization.
- Google Sheets as the order backend.
- Resend for transactional emails.
- Vite for building and running the project.

## Project Feel

The goal was to make something practical but still personal: a real ordering system that feels like it belongs to a family-owned catering business, not a generic checkout page. The site keeps the menu easy to scan, the order flow straightforward, and the kitchen details visible where they need to be.
