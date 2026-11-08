import XCTest

@MainActor final class ScreenCatalogMoneyFlows: ScreenCatalogBase {
  func test01MoneyAndIncome() throws {
    var app = open(); tool("Money", in: app)
    try capture("07-01", "Money - Expenses", route: "Home > Money", app: app)
    tap("Income", in: app)
    try capture("07-02", "Money - Income", route: "Money > Income", app: app)
    tap("Add income", in: app)
    try pages("07-03", "Add income", count: 2, route: "Money > Income > Add income", app: app)
    app = open(); tool("Money", in: app); tap("Spending & review", in: app)
    try pages("07-04", "Spending review", count: 2, route: "Money > Spending & review", app: app)
  }
  func test02ExpensesAndCategories() throws {
    var app = open(); tap("quick.expense", in: app)
    try pages("08-01", "Add expense and receipt", count: 2, route: "Home > Expense", app: app)
    app = open(); tap("quick.expense", in: app); tap("expense.category", in: app)
    try pages("08-02", "Expense category choices", count: 3, route: "Add expense > Category", app: app)
    app = open(); tap("quick.expense", in: app); tap("expense.classification", in: app)
    try capture("08-03", "Expense classification", route: "Add expense > Classification", app: app)
    for category in ["Meals & food", "Vehicle repairs"] {
      app = open(); tap("quick.expense", in: app); tap("expense.category", in: app); tap(category, in: app)
      tap("Business & vehicle details", in: app)
      try pages("08-04-\(category)", "Expense details - \(category)", count: 2, route: "Add expense > \(category) > Business & vehicle details", app: app)
    }
  }
  func test03BankAndStatementScreens() throws {
    var app = open(); tool("Money", in: app); tap("Banks & statement imports", in: app)
    try pages("09-01", "Bank transactions and statement review", count: 2, route: "Money > Banks & statement imports", app: app)
    app = open(); tool("Money", in: app); tap("Banks & statement imports", in: app); tap("Connect a bank", in: app)
    try pages("09-02", "Bank connection requirements", count: 2, route: "Banks > Connect a bank", app: app)
    app = open(); tool("Money", in: app); tap("Banks & statement imports", in: app); tap("Import a bank statement", in: app)
    try pages("09-03", "Bank statement import", count: 2, route: "Banks > Import a bank statement", app: app)
  }
}
