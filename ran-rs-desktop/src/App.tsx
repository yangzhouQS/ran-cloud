import { defineComponent } from 'vue';
import TelepresencePanel from './components/TelepresencePanel';

const App = defineComponent({
  name: 'App',
  setup() {
    return () => (
      <div class="app-container">
        <TelepresencePanel />
      </div>
    );
  },
});

export default App;
