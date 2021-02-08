import { Component, ElementRef, EventEmitter, HostBinding, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { getContrastingColor } from 'src/app/core/color-util';
import { coerceBooleanProperty } from 'src/app/core/util';
import { DataService } from '../data.service';

const DEFAULT_BACKGROUND_COLOR = '#bbdefb';

/**
 * Renders a label chip, which can optionally be clicked and deleted.
 */
@Component({
  selector: 'app-label',
  templateUrl: './label-chip.component.html',
  styleUrls: ['./label-chip.component.css']
})
export class LabelChipComponent implements OnChanges {
  private _inline = false;
  private _canClick = false;
  private _canDelete = false;

  @Input() @HostBinding('class.inline')
  get inline() { return this._inline; }
  set inline(value: boolean) { this._inline = coerceBooleanProperty(value); }
  @Input() @HostBinding('class.clickable')
  get canClick() { return this._canClick; }
  set canClick(value: boolean) { this._canClick = coerceBooleanProperty(value); }
  @Input()
  get canDelete() { return this._canDelete; }
  set canDelete(value: boolean) { this._canDelete = coerceBooleanProperty(value); }

  @Input()
  label = '';

  //@Output() click = new EventEmitter<MouseEvent>();
  /** Emitted when the user requests deletion of the label. */
  @Output() delete = new EventEmitter<MouseEvent | KeyboardEvent>();

  @HostBinding('style.backgroundColor')
  backgroundColor = '';
  @HostBinding('style.color')
  foregroundColor = '';

  constructor(
    private readonly dataService: DataService,
    private readonly element: ElementRef<HTMLElement>) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.label) {
      const config = this.dataService.getLabelConfig(this.label);
      this.backgroundColor = config?.displayColor || DEFAULT_BACKGROUND_COLOR;
      this.foregroundColor = getContrastingColor(this.backgroundColor);
    }
  }

  @HostBinding('attr.tabindex')
  get tabindex(): number | null {
    return this.canClick ? 0 : null;
  }

  @HostListener('keydown.delete', ['$event'])
  @HostListener('keydown.backspace', ['$event'])
  onDelete(event: KeyboardEvent) {
    event.stopPropagation();
    event.preventDefault();
    this.delete.emit(event);
  }

  // Necessary to programmatically focus this element from outside a template reference.
  focus() {
    this.element.nativeElement.focus();
  }
}
