import { SelectionModel } from '@angular/cdk/collections';
import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator, MatTableDataSource } from '@angular/material';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { Transaction, TransactionData } from '../../../proto/model';
import { LoggerService } from '../../core/logger.service';
import { moneyToNumber, timestampNow, timestampToDate } from '../../core/proto-util';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { MODE_ADD, MODE_EDIT } from '../transaction-edit/transaction-edit.component';
import { extractAllTransactionData } from '../model-util';

/** Time in ms to wait after input before applying the filter. */
const FILTER_DEBOUNCE_TIME = 500;

@Component({
  selector: 'app-transaction-list',
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.css'],
})
export class TransactionListComponent implements OnInit {
  transactionsDataSource = new MatTableDataSource<Transaction>();
  selection = new SelectionModel<Transaction>(true);

  @ViewChild(MatPaginator)
  private paginator: MatPaginator;
  /** Current value of the filter textbox (not debounced). */
  private _filterInput = "";
  private readonly filterSubject = new Subject<string>();

  get filterInput() { return this._filterInput; }
  set filterInput(value: string) {
    this._filterInput = value;
    this.filterSubject.next(value);
  }

  constructor(
    private readonly dataService: DataService,
    private readonly loggerService: LoggerService,
    private readonly dialogService: DialogService) { }

  ngOnInit() {
    this.transactionsDataSource.paginator = this.paginator;
    this.transactionsDataSource.filterPredicate = (transaction, filter) => this.matchesFilter(transaction, filter);

    this.dataService.transactionsSorted$.subscribe(
      value => this.transactionsDataSource.data = value
    );

    this.filterSubject
      .pipe(debounceTime(FILTER_DEBOUNCE_TIME))
      .subscribe(() => this.updateFilterNow());
  }

  ngOnDestroy() {
  }

  updateFilterNow() {
    if (this.transactionsDataSource.filter !== this.filterInput) {
      this.transactionsDataSource.filter = this.filterInput;
    }
  }

  clearFilter() {
    this.filterInput = "";
    this.updateFilterNow();
  }

  filterByLabel(label: string, additive: boolean) {
    let newFilter = this.filterInput;
    if (additive && newFilter.length > 0) {
      newFilter += " " + label;
    } else {
      newFilter = label;
    }

    this.filterInput = newFilter;
    this.updateFilterNow();
  }

  openImportCsvDialog() {
    const dialogRef = this.dialogService.openFormImport();
    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        const entries = dialogRef.componentInstance.entriesToImport;
        // Store rows, which generates their ids.
        this.dataService.addImportedRows(entries.map(e => e.row));
        // Link transactions to their rows and store them.
        for (let entry of entries) {
          entry.transaction.single!.importedRowId = entry.row.id;
          this.dataService.addTransactions(entry.transaction);
        }

        this.loggerService.log(`Imported ${dialogRef.componentInstance.entriesToImport.length} transactions.`);
      }
    });
  }

  openAddTransactionDialog() {
    const transaction = new Transaction({
      single: new TransactionData({
        date: timestampNow(),
        isCash: true,
      }),
    });

    this.dialogService.openTransactionEdit(transaction, MODE_ADD)
      .afterClosed().subscribe((value: boolean) => {
        if (value) {
          this.dataService.addTransactions(transaction);
        }
      });
  }

  editTransaction(transaction: Transaction) {
    const tempTransaction = Transaction.decode(Transaction.encode(transaction).finish());
    this.dialogService.openTransactionEdit(tempTransaction, MODE_EDIT)
      .afterClosed().subscribe(value => {
        if(value) {
          Object.assign(transaction, tempTransaction);
          console.log("Edited ", transaction);
        }
      });
  }

  async deleteSelectedTransactions() {
    const transactionsToDelete = this.selection.selected;

    // Detect orphans.
    const affectedRowIds = extractAllTransactionData(transactionsToDelete)
      .map(data => data.importedRowId)
      .filter(rowId => rowId > 0);
    const orphanedRowIds: number[] = [];
    for (let rowId of affectedRowIds) {
      const referrers = this.dataService.getTransactionsReferringToImportedRow(rowId);
      // If there is no referring transaction left that is not about to be deleted,
      // the row is about to be orphaned.
      if (!referrers.some(transaction => transactionsToDelete.indexOf(transaction) === -1)) {
        orphanedRowIds.push(rowId);
      }
    }

    // Ask what should happen to orphans.
    let deleteOrphans = false;
    if (orphanedRowIds.length > 0) {
      const result = await this.dialogService.openConfirmDeleteWithOrphans(
        transactionsToDelete.length, orphanedRowIds.length).afterClosed().toPromise();

      if (result === 'delete') {
        deleteOrphans = true;
      } else if (result === 'keep') {
        // Just keep them as is.
      } else {
        return; // Cancel.
      }
    }

    this.dataService.removeTransactions(transactionsToDelete);
    this.selection.clear();

    if (deleteOrphans) {
      for (let rowId of orphanedRowIds) {
        this.dataService.removeImportedRow(rowId);
      }
    }
  }

  addLabelToTransaction(principal: Transaction, newLabel: string) {
    if (newLabel.length === 0) return;
    // If the principal is within the selection,
    // assume the user wants to multi-edit all selected ones.
    const affectedTransactions = this.selection.isSelected(principal)
      ? this.selection.selected
      : [principal];

    for (let transaction of affectedTransactions) {
      if (transaction.labels.indexOf(newLabel) === -1) {
        transaction.labels.push(newLabel);
      }
    }
  }

  deleteLabelFromTransaction(principal: Transaction, label: string) {
    const affectedTransactions = this.selection.isSelected(principal)
      ? this.selection.selected
      : [principal];

    for (let transaction of affectedTransactions) {
      const index = transaction.labels.indexOf(label);
      if (index !== -1) {
        transaction.labels.splice(index, 1);
      }
    }
  }

  /** Returns the label that was deleted, or null if prerequisites were not met. */
  deleteLastLabelFromTransaction(principal: Transaction): string | null {
    if (principal.labels.length === 0) return null;
    const label = principal.labels[principal.labels.length - 1];

    const affectedTransactions = this.selection.isSelected(principal)
      ? this.selection.selected
      : [principal];

    // Don't to anything if operating on the entire selection,
    // but not all other selected transactions share the same last label.
    if (!affectedTransactions.every(otherTransaction =>
      otherTransaction.labels.length > 0
      && otherTransaction.labels[otherTransaction.labels.length - 1] === label
    )) {
      return null;
    }

    for (let transaction of affectedTransactions) {
      transaction.labels.splice(-1, 1);
    }
    return label;
  }

  /** Returns if the number of selected elements matches the total number of visible rows. */
  isAllSelected() {
    return this.selection.selected.length
      === this.transactionsDataSource.filteredData.length;
  }

  /** Selects all rows if they are not all selected; clears selection otherwise. */
  masterToggle() {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      for (let row of this.transactionsDataSource.filteredData) {
        this.selection.select(row);
      }
    }
  }

  getTransactionDate(transaction: Transaction): Date {
    return timestampToDate(transaction.single!.date);
  }

  getTransactionAmount(transaction: Transaction): number {
    return moneyToNumber(transaction.single!.amount);
  }

  formatTransactionNotes(transaction: Transaction): string {
    const data = [
      transaction.single!.who,
      transaction.single!.reason,
      transaction.single!.comment
    ];
    return data.filter(value => !!value).join(", ");
  }

  private matchesFilter(transaction: Transaction, filter: string): boolean {
    if (!filter) return true;

    return filter.split(/\s+/).every(filterPart => {
      let filterRegex;
      try { filterRegex = new RegExp(filterPart, 'i'); }
      catch (e) { return true; } // Assume user is still typing, always pass.

      const data = transaction.single!;
      return filterRegex.test(data.who)
        || filterRegex.test(data.whoIdentifier)
        || filterRegex.test(data.reason)
        || filterRegex.test(data.bookingText)
        || filterRegex.test(data.comment)
        || transaction.labels.some(label => filterRegex.test(label));
    });
  }

}
