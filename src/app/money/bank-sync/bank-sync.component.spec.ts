import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { BankSyncComponent } from './bank-sync.component';

describe('BankSyncComponent', () => {
  let component: BankSyncComponent;
  let fixture: ComponentFixture<BankSyncComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BankSyncComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BankSyncComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
